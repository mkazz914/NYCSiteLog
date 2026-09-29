import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import { pool } from "../db";

const GOOGLE_ISSUER = "https://accounts.google.com";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const isProd = process.env.NODE_ENV === "production";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

// Only these Google accounts may sign in (comma-separated, case-insensitive).
// Fails closed: if it is empty, nobody gets in.
function getAllowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

// Optional: every account managed by these Google Workspace domains may sign in
// (comma-separated, e.g. "mfmcontracting.com"). Checked against Google's `hd`
// (hosted domain) claim, so a look-alike personal account cannot use it.
function getAllowedDomains(): Set<string> {
  return new Set(
    (process.env.ALLOWED_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
  );
}

// Public base URL of the site, used to build the Google redirect URI.
function getBaseUrl(): string {
  return (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, "");
}

const getOidcConfig = memoize(
  async () =>
    client.discovery(
      new URL(GOOGLE_ISSUER),
      requireEnv("GOOGLE_CLIENT_ID"),
      requireEnv("GOOGLE_CLIENT_SECRET")
    ),
  { maxAge: 3600 * 1000 }
);

async function ensureSessionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid varchar PRIMARY KEY,
      sess jsonb NOT NULL,
      expire timestamp NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);
  `);
}

export function getSession() {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    pool,
    createTableIfMissing: false, // created by ensureSessionsTable()
    ttl: SESSION_TTL_MS / 1000,
    tableName: "sessions",
  });
  return session({
    secret: requireEnv("SESSION_SECRET"),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: SESSION_TTL_MS,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  await ensureSessionsTable();
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();
  const allowedEmails = getAllowedEmails();
  const allowedDomains = getAllowedDomains();
  if (allowedEmails.size === 0 && allowedDomains.size === 0) {
    console.warn("ALLOWED_EMAILS and ALLOWED_DOMAINS are both empty: nobody will be able to sign in.");
  }

  const verify: VerifyFunction = async (tokens, verified) => {
    try {
      const claims: any = tokens.claims();
      const email = String(claims?.email ?? "").toLowerCase();
      const hostedDomain = String(claims?.hd ?? "").toLowerCase();
      const isAllowed =
        allowedEmails.has(email) || (hostedDomain !== "" && allowedDomains.has(hostedDomain));
      if (!claims?.sub || !email || claims.email_verified !== true || !isAllowed) {
        console.warn(`Sign-in rejected for ${email || "unknown account"}`);
        return verified(null, false);
      }
      await authStorage.upsertUser({
        id: claims.sub,
        email,
        firstName: claims.given_name,
        lastName: claims.family_name,
        profileImageUrl: claims.picture,
      });
      // Keep the same session shape the rest of the app expects.
      verified(null, {
        claims: { sub: claims.sub, email },
        expires_at: Math.floor((Date.now() + SESSION_TTL_MS) / 1000),
      });
    } catch (err) {
      verified(err as Error);
    }
  };

  passport.use(
    "google",
    new Strategy(
      {
        name: "google",
        config,
        scope: "openid email profile",
        callbackURL: `${getBaseUrl()}/api/callback`,
      },
      verify
    )
  );

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    passport.authenticate("google", { prompt: "select_account" } as any)(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    passport.authenticate("google", {
      successReturnToOrRedirect: "/",
      failureRedirect: "/?error=signin_failed",
    })(req, res, (err: any) => {
      if (err) {
        console.error("Auth callback error:", err);
        return res.redirect("/?error=signin_failed");
      }
      next();
    });
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => res.redirect("/"));
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  const user = req.user as any;
  const now = Math.floor(Date.now() / 1000);
  if (!req.isAuthenticated() || !user?.expires_at || now > user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};
