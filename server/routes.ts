import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Create Log
  app.post(api.logs.create.path, async (req, res) => {
    try {
      const input = api.logs.create.input.parse(req.body);
      const log = await storage.createLog(input);
      res.status(201).json(log);
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

  // List Logs
  app.get(api.logs.list.path, async (req, res) => {
    const logs = await storage.getLogs();
    res.json(logs);
  });

  // Get Log
  app.get(api.logs.get.path, async (req, res) => {
    const log = await storage.getLog(Number(req.params.id));
    if (!log) {
      return res.status(404).json({ message: 'Log not found' });
    }
    res.json(log);
  });

  // Generate PDF
  app.get(api.logs.exportPdf.path, async (req, res) => {
    const log = await storage.getLog(Number(req.params.id));
    if (!log) {
      return res.status(404).json({ message: 'Log not found' });
    }

    try {
      // Load PDF template
      // Note: In Replit, attached assets are usually in the root or attached_assets folder
      const templatePath = path.join(process.cwd(), "attached_assets", "NYCDDC_-_Sign_In_Sheet_APP_1766096042760.pdf");
      
      if (!fs.existsSync(templatePath)) {
        console.error("PDF template not found at:", templatePath);
        return res.status(500).json({ message: "PDF template not found" });
      }

      const templateBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();

      // Debug: Log field names to help mapping
      const fields = form.getFields();
      console.log("PDF Fields:", fields.map(f => f.getName()));

      // Helper to safe fill
      const safeFill = (name: string, value: string | undefined | null) => {
        if (!value) return;
        try {
          const field = form.getTextField(name);
          if (field) field.setText(value);
        } catch (e) {
          console.log(`Field ${name} not found or not text`);
        }
      };

      // Map fields (Guesses based on standard naming, will verify with logs)
      // Based on PDF content:
      // Prime Contractor, Subcontractor, Contract #, Address, Agency, Project Name/Location, Date
      
      // Try exact names from visual inspection if they match field names, 
      // otherwise we might need to adjust after seeing logs.
      // Common PDF form names might be "Text1", "undefined", or descriptive.
      // I'll try descriptive first.
      safeFill("Prime Contractor", log.primeContractor);
      safeFill("Subcontractor", log.subcontractor);
      safeFill("Contract", log.contractNumber); // or "Contract #"
      safeFill("Address", log.address);
      safeFill("Agency", log.agency);
      safeFill("Project NameLocation", log.projectNameLocation); // or "Project Name"
      safeFill("Date", log.date ? new Date(log.date).toLocaleDateString() : "");

      safeFill("NamePrint", log.contractorRepName);
      safeFill("Title", log.contractorRepTitle);
      safeFill("Date_2", log.contractorRepDate ? new Date(log.contractorRepDate).toLocaleDateString() : "");

      // Embed Contractor Rep Signature
      if (log.contractorRepSignature) {
        try {
          const pngImage = await pdfDoc.embedPng(log.contractorRepSignature);
          // Need to find where to put it. 
          // If there is a signature field, we might get its widget rect.
          // Or just place it at coordinates.
          // For now, I'll try to find a field named "SignatureContractors Representative"
          try {
             const sigField = form.getTextField("SignatureContractors Representative");
             // If it exists, we can overlay image? 
             // PDF forms are tricky. 
             // Simplest for MVP: If field exists, use its bounds.
             // Otherwise, coordinate guess?
             // I'll log field names and refine later.
          } catch (e) {}
        } catch (e) {
          console.error("Error embedding rep signature", e);
        }
      }

      // Workers
      // Loop through workers and try to fill "Employees Name Row 1", etc.
      log.workers.forEach((worker, index) => {
        const row = index + 1;
        safeFill(`Employees Name Row ${row}`, worker.name);
        safeFill(`Classification Row ${row}`, worker.classification);
        safeFill(`Time In Row ${row}`, worker.timeIn);
        safeFill(`Time Out Row ${row}`, worker.timeOut);
        
        // Signatures would need embedding
      });
      
      // Flatten form to make it read-only
      form.flatten();

      const pdfBytes = await pdfDoc.save();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="DailyLog-${log.id}.pdf"`);
      res.send(Buffer.from(pdfBytes));

    } catch (error) {
      console.error("PDF generation error:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  return httpServer;
}
