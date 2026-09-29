import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { securityHeaders, rateLimit } from "./security";
import { pool } from "./db";

const app = express();
const httpServer = createServer(app);

// The site runs behind Render's proxy: trust it for the real client IP.
app.set("trust proxy", 1);
app.use(securityHeaders);

// Uptime check for Render and monitoring tools. No login needed, no data exposed.
app.get("/healthz", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch (err) {
    console.error("Health check failed:", err);
    res.status(503).json({ ok: false });
  }
});

// Rate limits (per client IP). Generous for normal use, tight for login and PDFs.
app.use("/api/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));
app.use("/api/callback", rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));
app.use(/^\/api\/logs\/[^/]+\/pdf$/, rateLimit({ windowMs: 60 * 1000, max: 20 }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "5mb", // signature images are sent as base64
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Request log: method, path, status and timing only. Response bodies are never
// logged because they contain worker names and signature images.
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(status).json({
      message: status >= 500 ? "Internal Server Error" : err.message || "Request failed",
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
