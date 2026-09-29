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

function parseList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

// A provider is switched on by setting its environment variables.
const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const microsoftEnabled = () =>
  !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID);

// Public base URL of the site, used to build the redirect URIs.
function getBaseUrl(): string {
  return (process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, "");
}

const getGoogleConfig = memoize(
  async () =>
    client.discovery(
      new URL(GOOGLE_ISSUER),
      requireEnv("GOOGLE_CLIENT_ID"),
      requireEnv("GOOGLE_CLIENT_SECRET")
    ),
  { maxAge: 3600 * 1000 }
);

// Single-tenant only: sign-in is limited to accounts in your own company's
// Microsoft directory (MICROSOFT_TENANT_ID is its Directory (tenant) ID).
const getMicrosoftConfig = memoize(
  async () =>
    client.discovery(
      new URL(`https://login.microsoftonline.com/${requireEnv("MICROSOFT_TENANT_ID")}/v2.0`),
      requireEnv("MICROSOFT_CLIENT_ID"),
      requireEnv("MICROSOFT_CLIENT_SECRET")
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

type Identity = {
  providerId: string; // stable id from the provider, used only for brand-new users
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  // Domain the provider itself vouches for (Google Workspace `hd`, or the
  // company domain for a single-tenant Microsoft sign-in). Used by ALLOWED_DOMAINS.
  managedDomain?: string;
};

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  if (!googleEnabled() && !microsoftEnabled()) {
    throw new Error(
      "No sign-in method configured: set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET and/or " +
        "MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET/MICROSOFT_TENANT_ID"
    );
  }

  await ensureSessionsTable();
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const allowedEmails = parseList(process.env.ALLOWED_EMAILS);
  const allowedDomains = parseList(process.env.ALLOWED_DOMAINS);
  if (allowedEmails.size === 0 && allowedDomains.size === 0) {
    console.warn("ALLOWED_EMAILS and ALLOWED_DOMAINS are both empty: nobody will be able to sign in.");
  }

  // Shared by every sign-in method: check the invite list, then find or create the user.
  // People are matched by email, so the same person signing in with Google or
  // Microsoft lands in the same account (and keeps the same logs).
  async function admit(identity: Identity | null) {
    const email = identity?.email.trim().toLowerCase() ?? "";
    if (!identity || !email.includes("@")) return false;
    const managedDomain = (identity.managedDomain ?? "").toLowerCase();
    const isAllowed = allowedEmails.has(email) || (managedDomain !== "" && allowedDomains.has(managedDomain));
    if (!isAllowed) {
      console.warn(`Sign-in rejected for ${email}`);
      return false;
    }
    const existing = await authStorage.getUserByEmail(email);
    const id = existing?.id ?? identity.providerId;
    await authStorage.upsertUser({
      id,
      email,
      firstName: identity.firstName,
      lastName: identity.lastName,
      profileImageUrl: identity.picture,
    });
    // Keep the same session shape the rest of the app expects.
    return {
      claims: { sub: id, email },
      expires_at: Math.floor((Date.now() + SESSION_TTL_MS) / 1000),
    };
  }

  const makeVerify =
    (toIdentity: (claims: any) => Identity | null): VerifyFunction =>
    async (tokens, verified) => {
      try {
        verified(null, await admit(toIdentity(tokens.claims())));
      } catch (err) {
        verified(err as Error);
      }
    };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  const failureRedirect = "/?error=signin_failed";
  const callbackHandler =
    (name: string): RequestHandler =>
    (req, res, next) => {
      passport.authenticate(name, {
        successReturnToOrRedirect: "/",
        failureRedirect,
      })(req, res, (err: any) => {
        if (err) {
          console.error(`Auth callback error (${name}):`, err);
          return res.redirect(failureRedirect);
        }
        next();
      });
    };

  if (googleEnabled()) {
    passport.use(
      "google",
      new Strategy(
        {
          name: "google",
          config: await getGoogleConfig(),
          scope: "openid email profile",
          callbackURL: `${getBaseUrl()}/api/callback`,
        },
        makeVerify((claims) =>
          claims?.sub && claims.email && claims.email_verified === true
            ? {
                providerId: claims.sub,
                email: claims.email,
                firstName: claims.given_name,
                lastName: claims.family_name,
                picture: claims.picture,
                managedDomain: claims.hd,
              }
            : null
        )
      )
    );
    app.get("/api/login", (req, res, next) => {
      passport.authenticate("google", { prompt: "select_account" } as any)(req, res, next);
    });
    app.get("/api/callback", callbackHandler("google"));
  }

  if (microsoftEnabled()) {
    passport.use(
      "microsoft",
      new Strategy(
        {
          name: "microsoft",
          config: await getMicrosoftConfig(),
          scope: "openid profile email",
          callbackURL: `${getBaseUrl()}/api/callback/microsoft`,
        },
        makeVerify((claims) => {
          // Work accounts usually carry `email`; `preferred_username` is the sign-in name.
          const email = String(claims?.email ?? claims?.preferred_username ?? "").toLowerCase();
          if (!claims?.sub || !email.includes("@")) return null;
          const [firstName, ...rest] = String(claims.name ?? "").split(" ");
          return {
            providerId: `ms:${claims.oid ?? claims.sub}`,
            email,
            firstName: firstName || undefined,
            lastName: rest.join(" ") || undefined,
            managedDomain: email.split("@")[1],
          };
        })
      )
    );
    app.get("/api/login/microsoft", (req, res, next) => {
      passport.authenticate("microsoft", { prompt: "select_account" } as any)(req, res, next);
    });
    app.get("/api/callback/microsoft", callbackHandler("microsoft"));
  }

  // Lets the sign-in page show only the buttons that are configured.
  app.get("/api/auth/providers", (_req, res) => {
    res.json({ google: googleEnabled(), microsoft: microsoftEnabled() });
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
