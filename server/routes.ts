import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { db } from "./db";
import { workers, auditEvents } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { recordAudit } from "./audit";
import { buildLogPdf, loadTemplate } from "./pdf";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./auth";

const BATCH_PDF_MAX_LOGS = 50;

const batchPdfSchema = z
  .object({
    contractNumber: z.string().min(1, "Choose a job"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date is required"),
    includeDrafts: z.boolean().optional().default(false),
  })
  .refine((v) => v.from <= v.to, { message: "Start date must be on or before the end date", path: ["from"] });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Express 4 does not catch errors thrown inside async handlers, so an
  // unexpected failure would leave the request hanging. Route them to the
  // error handler in index.ts (which answers with a clean 500) instead.
  const wrapAsync = (fn: any) =>
    typeof fn === "function" && fn.length < 4
      ? (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next)
      : fn;
  for (const method of ["get", "post", "patch", "delete"] as const) {
    const original = (app as any)[method].bind(app);
    (app as any)[method] = (path: any, ...handlers: any[]) =>
      handlers.length === 0 ? original(path) : original(path, ...handlers.map(wrapAsync));
  }

  // Setup auth BEFORE other routes
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Create Log
  app.post(api.logs.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const input = api.logs.create.input.parse(req.body);
      const log = await storage.createLog(input, userId);
      await recordAudit(req, "log.create", log.id, `workers=${input.workers.length}`);
      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error("Error creating log:", err);
      return res.status(500).json({ message: "Failed to save daily log" });
    }
  });

  // List Logs
  app.get(api.logs.list.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const logs = await storage.getLogs(userId);
    res.json(logs);
  });

  // Get Log
  app.get(api.logs.get.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const log = await storage.getLog(Number(req.params.id), userId);
    if (!log) {
      return res.status(404).json({ message: 'Log not found' });
    }
    res.json(log);
  });

  // Generate PDF
  app.get(api.logs.exportPdf.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const log = await storage.getLog(Number(req.params.id), userId);
    if (!log) {
      return res.status(404).json({ message: 'Log not found' });
    }

    try {
      const templateBytes = loadTemplate();
      if (!templateBytes) {
        return res.status(500).json({ message: "PDF template not found" });
      }

      const finalPdf = await buildLogPdf(log, templateBytes);

      const pdfBytes = await finalPdf.save();
      await recordAudit(req, "log.export_pdf", log.id);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="DailyLog-${log.id}.pdf"`);
      res.send(Buffer.from(pdfBytes));

    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // Batch export: every log for one job (contract number) in a date range, merged into one PDF.
  // Signed logs only unless includeDrafts is set; drafts are stamped "DRAFT" on each page.
  app.post("/api/logs/batch-pdf", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;

    let input: z.infer<typeof batchPdfSchema>;
    try {
      input = batchPdfSchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }

    const allLogs = await storage.getLogs(userId);
    const matching = allLogs
      .filter(
        (l) =>
          l.contractNumber === input.contractNumber &&
          l.date >= input.from &&
          l.date <= input.to &&
          (input.includeDrafts || !!l.contractorRepSignature)
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

    if (matching.length === 0) {
      return res.status(404).json({
        message: input.includeDrafts
          ? "No logs found for that job and date range."
          : "No signed logs found for that job and date range. Tick 'include unsigned drafts' to export drafts too.",
      });
    }
    if (matching.length > BATCH_PDF_MAX_LOGS) {
      return res.status(400).json({
        message: `That range has ${matching.length} logs. Please narrow it to ${BATCH_PDF_MAX_LOGS} or fewer.`,
      });
    }

    const templateBytes = loadTemplate();
    if (!templateBytes) {
      return res.status(500).json({ message: "PDF template not found" });
    }

    // Built one log at a time to keep memory use low on small servers.
    const merged = await PDFDocument.create();
    for (const row of matching) {
      const log = await storage.getLog(row.id, userId);
      if (!log) continue;
      const doc = await buildLogPdf(log, templateBytes, { draft: !log.contractorRepSignature });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    }
    const pdfBytes = await merged.save();

    await recordAudit(
      req,
      "log.batch_export_pdf",
      null,
      `contract=${input.contractNumber}; from=${input.from}; to=${input.to}; logs=${matching.length}; drafts=${input.includeDrafts}`
    );

    const safeContract = input.contractNumber.replace(/[^\w.-]+/g, "_");
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="SignIn_${safeContract}_${input.from}_to_${input.to}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  });

  // Clone Log
  app.post(api.logs.clone.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const clonedLog = await storage.cloneLog(Number(req.params.id), userId);
      if (!clonedLog) {
        return res.status(404).json({ message: 'Log not found' });
      }
      await recordAudit(req, "log.clone", clonedLog.id, `from=${req.params.id}`);
      res.status(201).json(clonedLog);
    } catch (err) {
      console.error("Error cloning log:", err);
      return res.status(500).json({ message: "Failed to clone log" });
    }
  });

  // Delete Log (only unsigned logs can be deleted)
  app.delete(api.logs.delete.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const log = await storage.getLog(Number(req.params.id), userId);
    if (!log) {
      return res.status(404).json({ message: 'Log not found' });
    }
    if (log.contractorRepSignature) {
      return res.status(400).json({ message: 'Cannot delete a signed log' });
    }
    const success = await storage.deleteLog(Number(req.params.id), userId);
    if (success) await recordAudit(req, "log.delete", log.id);
    res.json({ success });
  });

  // Update Log (only unsigned logs can be updated)
  app.patch(api.logs.update.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const logId = Number(req.params.id);
      const log = await storage.getLog(logId, userId);
      if (!log) {
        return res.status(404).json({ message: 'Log not found' });
      }
      if (log.contractorRepSignature) {
        return res.status(400).json({ message: 'Cannot update a signed log' });
      }
      
      const input = api.logs.update.input.parse(req.body);
      const updated = await storage.updateLog(logId, input, userId);
      if (!updated) {
        return res.status(404).json({ message: 'Log not found' });
      }
      await recordAudit(req, "log.update", logId, `fields=${Object.keys(input).join(",")}`);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Sign/Finalize Log (only unsigned logs can be signed)
  app.post(api.logs.sign.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const logId = Number(req.params.id);
      const log = await storage.getLog(logId, userId);
      if (!log) {
        return res.status(404).json({ message: 'Log not found' });
      }
      if (log.contractorRepSignature) {
        return res.status(400).json({ message: 'Log is already signed' });
      }
      
      const input = api.logs.sign.input.parse(req.body);
      const updated = await storage.signLog(logId, input, userId);
      if (!updated) {
        return res.status(404).json({ message: 'Log not found' });
      }
      await recordAudit(req, "log.sign", logId, `signer=${input.contractorRepName}; title=${input.contractorRepTitle}`);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Add Worker to Log
  app.post(api.workers.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const logId = Number(req.params.logId);
      const log = await storage.getLog(logId, userId);
      if (!log) {
        return res.status(404).json({ message: 'Log not found' });
      }
      if (log.contractorRepSignature) {
        return res.status(400).json({ message: 'Cannot add workers to a signed log' });
      }
      
      const input = api.workers.create.input.parse(req.body);
      const worker = await storage.addWorker(logId, input, userId);
      if (!worker) {
        return res.status(404).json({ message: 'Log not found' });
      }
      await recordAudit(req, "worker.add", logId, `worker=${worker.id}`);
      res.status(201).json(worker);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Update Worker (time-out and signatures)
  app.patch(api.workers.update.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workerId = Number(req.params.id);
      
      // Check if worker exists
      const [workerRecord] = await db.select().from(workers).where(eq(workers.id, workerId));
      if (!workerRecord) {
        return res.status(404).json({ message: 'Worker not found' });
      }
      
      // Check if parent log is signed (immutable)
      const log = await storage.getLog(workerRecord.dailyLogId, userId);
      if (!log) {
        return res.status(404).json({ message: 'Log not found' });
      }
      if (log.contractorRepSignature) {
        return res.status(400).json({ message: 'Cannot update workers on a signed log' });
      }
      
      const input = api.workers.update.input.parse(req.body);
      const updated = await storage.updateWorker(workerId, input, userId);
      if (!updated) {
        return res.status(404).json({ message: 'Worker not found' });
      }
      await recordAudit(req, "worker.update", workerRecord.dailyLogId, `worker=${workerId}; fields=${Object.keys(input).join(",")}`);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Delete Worker (not allowed once the log has been signed)
  app.delete(api.workers.delete.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const workerId = Number(req.params.id);

    const [workerRecord] = await db.select().from(workers).where(eq(workers.id, workerId));
    if (!workerRecord) {
      return res.status(404).json({ message: 'Worker not found' });
    }
    const log = await storage.getLog(workerRecord.dailyLogId, userId);
    if (!log) {
      return res.status(404).json({ message: 'Worker not found' });
    }
    if (log.contractorRepSignature) {
      return res.status(400).json({ message: 'Cannot remove workers from a signed log' });
    }

    const success = await storage.deleteWorker(workerId, userId);
    if (!success) {
      return res.status(404).json({ message: 'Worker not found' });
    }
    await recordAudit(req, "worker.delete", workerRecord.dailyLogId, `worker=${workerId}`);
    res.json({ success: true });
  });

  // Activity history for a log (owner only)
  app.get("/api/logs/:id/audit", isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const logId = Number(req.params.id);
    const log = await storage.getLog(logId, userId);
    if (!log) {
      return res.status(404).json({ message: 'Log not found' });
    }
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.logId, logId))
      .orderBy(desc(auditEvents.createdAt));
    res.json(events);
  });

  return httpServer;
}
