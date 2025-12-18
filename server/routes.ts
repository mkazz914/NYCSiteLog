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
      const templatePath = path.join(process.cwd(), "attached_assets", "NYCDDC_-_Sign_In_Sheet_APP_1766096042760.pdf");
      
      if (!fs.existsSync(templatePath)) {
        console.error("PDF template not found at:", templatePath);
        return res.status(500).json({ message: "PDF template not found" });
      }

      const templateBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();
      const page = pdfDoc.getPage(0);
      const { width, height } = page.getSize();

      // Helper to safe fill form field
      const safeFill = (name: string, value: string | undefined | null) => {
        if (!value) return;
        try {
          const field = form.getTextField(name);
          if (field) field.setText(value);
        } catch (e) {
          // Field doesn't exist, continue
        }
      };

      // Try to fill form fields for header info
      safeFill("Prime Contractor", log.primeContractor);
      safeFill("Subcontractor", log.subcontractor);
      safeFill("Contract", log.contractNumber);
      safeFill("Address", log.address);
      safeFill("Agency", log.agency);
      safeFill("Project Name/Location", log.projectNameLocation);
      safeFill("Project NameLocation", log.projectNameLocation);
      safeFill("Date", log.date ? new Date(log.date).toLocaleDateString() : "");

      safeFill("Name(Print)", log.contractorRepName);
      safeFill("NamePrint", log.contractorRepName);
      safeFill("Title", log.contractorRepTitle);
      safeFill("Date_2", log.contractorRepDate ? new Date(log.contractorRepDate).toLocaleDateString() : "");

      // Add worker data directly to page as text
      // Position workers section starting from a calculated Y position
      // Typical A4/Letter page height ~792pt, workers table usually starts around y=400-450
      let currentY = 420; // Approximate position for first worker row
      const columnXPositions = {
        name: 50,
        classification: 150,
        timeIn: 250,
        timeOut: 350
      };
      const rowHeight = 20; // Space between rows

      // Add worker rows
      if (log.workers && log.workers.length > 0) {
        log.workers.forEach((worker) => {
          // Draw text for each worker field (defaults to black)
          page.drawText(worker.name || "", {
            x: columnXPositions.name,
            y: currentY,
            size: 10
          });

          page.drawText(worker.classification || "", {
            x: columnXPositions.classification,
            y: currentY,
            size: 10
          });

          page.drawText(worker.timeIn || "", {
            x: columnXPositions.timeIn,
            y: currentY,
            size: 10
          });

          page.drawText(worker.timeOut || "", {
            x: columnXPositions.timeOut,
            y: currentY,
            size: 10
          });

          currentY -= rowHeight; // Move to next row
        });
      }

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
