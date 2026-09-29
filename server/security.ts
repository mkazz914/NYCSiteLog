import type { RequestHandler } from "express";

const isProd = process.env.NODE_ENV === "production";

// Standard browser hardening headers. The Content-Security-Policy only allows
// this site's own scripts, plus Google Fonts for styles and fonts.
// If a page ever looks broken after a deploy, set CSP=off in the environment
// to switch the policy off without a code change.
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProd) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    if (process.env.CSP !== "off") {
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "img-src 'self' data: blob:",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; ")
      );
    }
  }
  next();
};

// Small in-memory rate limiter, keyed by client IP. Good enough for a single
// server instance; counters reset when the server restarts.
export function rateLimit(opts: { windowMs: number; max: number; message?: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    hits.forEach((entry, key) => {
      if (entry.resetAt <= now) hits.delete(key);
    });
  }, opts.windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || "unknown";
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > opts.max) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ message: opts.message ?? "Too many requests. Please try again shortly." });
    }
    next();
  };
}
