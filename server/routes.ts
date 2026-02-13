import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { db } from "./db";
import { workers } from "@shared/schema";
import { eq } from "drizzle-orm";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Setup auth BEFORE other routes
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Debug endpoint to list all form fields in PDF
  app.get("/api/debug/pdf-fields", isAuthenticated, async (req, res) => {
    try {
      const templatePath = path.join(process.cwd(), "attached_assets", "NYCDDC_-_Sign_In_Sheet_APP_1766096042760.pdf");
      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ message: "PDF template not found" });
      }
      
      const templateBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();
      
      const fields: string[] = [];
      try {
        const fieldList = form.getFields();
        fieldList.forEach((field) => {
          fields.push(field.getName());
        });
      } catch (e) {
        // Continue
      }
      
      res.json({
        fields: fields,
        message: "Available PDF form fields"
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create Log
  app.post(api.logs.create.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const input = api.logs.create.input.parse(req.body);
      const log = await storage.createLog(input, userId);
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
      const templatePath = path.join(process.cwd(), "attached_assets", "NYCDDC_-_Sign_In_Sheet_APP_1766096042760.pdf");
      
      if (!fs.existsSync(templatePath)) {
        console.error("PDF template not found at:", templatePath);
        return res.status(500).json({ message: "PDF template not found" });
      }

      const templateBytes = fs.readFileSync(templatePath);
      const workers = log.workers || [];
      const WORKERS_PER_PAGE = 12;
      const numPages = Math.max(1, Math.ceil(workers.length / WORKERS_PER_PAGE));

      const finalPdf = await PDFDocument.create();

      for (let pageNum = 0; pageNum < numPages; pageNum++) {
        const pdfDoc = await PDFDocument.load(templateBytes);
        const form = pdfDoc.getForm();
        const page = pdfDoc.getPage(0);

        const safeFill = (name: string, value: string | undefined | null) => {
          if (!value) return;
          try {
            const field = form.getTextField(name);
            if (field) field.setText(value);
          } catch (e) {}
        };

        safeFill("Prime Contractor", log.primeContractor);
        safeFill("Subcontractor", log.subcontractor);
        safeFill("Contract", log.contractNumber);
        safeFill("Address", log.address);
        safeFill("Agency", log.agency);
        safeFill("Project Name/Location", log.projectNameLocation);
        safeFill("Project NameLocation", log.projectNameLocation);
        
        const dateStr = log.date ? new Date(log.date + "T12:00:00").toLocaleDateString() : "";
        safeFill("Date", dateStr);

        safeFill("Name(Print)", log.contractorRepName);
        safeFill("NamePrint", log.contractorRepName);
        safeFill("Title", log.contractorRepTitle);
        const repDateStr = log.contractorRepDate ? new Date(log.contractorRepDate + "T12:00:00").toLocaleDateString() : "";
        safeFill("Date_2", repDateStr);
        safeFill("DATE", repDateStr);

        const embedSignatureInField = async (fieldName: string, signatureData: string | undefined) => {
          if (!signatureData || !signatureData.startsWith('data:image')) return;
          try {
            const base64Data = signatureData.split(',')[1];
            if (base64Data) {
              const imageBytes = Buffer.from(base64Data, 'base64');
              const image = await pdfDoc.embedPng(imageBytes);
              try {
                const field = form.getField(fieldName);
                if (field && 'setImage' in field) {
                  (field as any).setImage(image);
                }
              } catch (e) {}
            }
          } catch (e) {}
        };

        const startIndex = pageNum * WORKERS_PER_PAGE;
        const endIndex = Math.min(startIndex + WORKERS_PER_PAGE, workers.length);
        
        for (let i = startIndex; i < endIndex; i++) {
          const worker = workers[i];
          const rowIndex = i - startIndex;
          const fieldIndex = `1.${rowIndex}`;

          try {
            const nameField = form.getTextField(`Employee Name ${fieldIndex}`);
            if (nameField && worker.name) nameField.setText(worker.name);
          } catch (e) {}

          try {
            const classField = form.getTextField(`Classification${fieldIndex}`);
            if (classField && worker.classification) classField.setText(worker.classification);
          } catch (e) {}

          try {
            const timeInField = form.getTextField(`Time_In${fieldIndex}`);
            if (timeInField && worker.timeIn) timeInField.setText(worker.timeIn);
          } catch (e) {}

          try {
            const timeOutField = form.getTextField(`Time_Out${fieldIndex}`);
            if (timeOutField && worker.timeOut) timeOutField.setText(worker.timeOut);
          } catch (e) {}

          try {
            if (worker.signatureIn && worker.signatureIn.startsWith('data:image')) {
              await embedSignatureInField(`EmployeeSigIn_${fieldIndex}`, worker.signatureIn);
            }
          } catch (e) {}

          try {
            if (worker.signatureOut && worker.signatureOut.startsWith('data:image')) {
              await embedSignatureInField(`EmployeeSigOut${fieldIndex}`, worker.signatureOut);
            }
          } catch (e) {}
        }

        try {
          if (log.contractorRepSignature && log.contractorRepSignature.startsWith('data:image')) {
            const base64Data = log.contractorRepSignature.split(',')[1];
            if (base64Data) {
              const imageBytes = Buffer.from(base64Data, 'base64');
              const image = await pdfDoc.embedPng(imageBytes);
              page.drawImage(image, {
                x: 20,
                y: 70,
                width: 80,
                height: 40
              });
            }
          }
        } catch (e) {}

        form.flatten();
        
        const [copiedPage] = await finalPdf.copyPages(pdfDoc, [0]);
        finalPdf.addPage(copiedPage);
      }

      const pdfBytes = await finalPdf.save();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="DailyLog-${log.id}.pdf"`);
      res.send(Buffer.from(pdfBytes));

    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // Clone Log
  app.post(api.logs.clone.path, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const clonedLog = await storage.cloneLog(Number(req.params.id), userId);
      if (!clonedLog) {
        return res.status(404).json({ message: 'Log not found' });
      }
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

  // Delete Worker
  app.delete(api.workers.delete.path, isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    const success = await storage.deleteWorker(Number(req.params.id), userId);
    if (!success) {
      return res.status(404).json({ message: 'Worker not found' });
    }
    res.json({ success: true });
  });

  return httpServer;
}
