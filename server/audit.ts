import { db } from "./db";
import { auditEvents } from "@shared/schema";

// Records who did what to a log, and when. Never store signature images or
// other large payloads in `detail`: field names and ids only.
// A failure to write an audit row is logged but never breaks the user's request.
export async function recordAudit(req: any, action: string, logId: number | null, detail?: string) {
  try {
    await db.insert(auditEvents).values({
      logId,
      userId: req.user?.claims?.sub ?? "unknown",
      userEmail: req.user?.claims?.email ?? null,
      action,
      detail: detail ?? null,
      ip: req.ip ?? null,
    });
  } catch (err) {
    console.error("Audit write failed:", err);
  }
}
