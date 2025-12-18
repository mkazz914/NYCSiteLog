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
  
  // Debug endpoint to list all form fields in PDF
  app.get("/api/debug/pdf-fields", async (req, res) => {
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

      // Log all available form fields for debugging
      console.log("=== PDF FORM FIELDS AVAILABLE ===");
      try {
        const fields = form.getFields();
        fields.forEach((field) => {
          console.log(`Field: "${field.getName()}" - Type: ${field.constructor.name}`);
        });
      } catch (e) {
        console.log("Could not list form fields");
      }
      console.log("=== END FORM FIELDS ===");

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

      // Helper to embed signature image into a field
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
            } catch (e) {
              // Field doesn't exist or can't set image, skip
            }
          }
        } catch (e) {
          console.log(`Could not embed signature for field: ${fieldName}`);
        }
      };

      // Map worker data to form fields by row index
      if (log.workers && log.workers.length > 0) {
        for (let i = 0; i < log.workers.length && i < 15; i++) {
          const worker = log.workers[i];
          const rowIndex = i + 1; // PDF row numbering typically starts at 1

          // Try multiple naming patterns for worker data fields
          const namePatterns = [
            `Name${rowIndex}`,
            `Name ${rowIndex}`,
            `Worker Name${rowIndex}`,
            `WorkerName${rowIndex}`,
            `name_${rowIndex}`,
            `Name_Row_${rowIndex}`,
            `Name (${rowIndex})`,
            `Name_${rowIndex}`,
            `NAME${rowIndex}`,
            `workerName_${rowIndex}`,
            `EmployeeName${rowIndex}`,
            `Employee Name${rowIndex}`,
            `Field${rowIndex}`,
            `Text${rowIndex}`
          ];

          const classificationPatterns = [
            `Classification${rowIndex}`,
            `Classification ${rowIndex}`,
            `Worker Classification${rowIndex}`,
            `WorkerClassification${rowIndex}`,
            `classification_${rowIndex}`,
            `Class${rowIndex}`,
            `Classification_${rowIndex}`,
            `CLASSIFICATION${rowIndex}`,
            `Title${rowIndex}`,
            `Job Title${rowIndex}`,
            `Position${rowIndex}`,
            `Craft${rowIndex}`,
            `Trade${rowIndex}`
          ];

          const timeInPatterns = [
            `Time In${rowIndex}`,
            `Time In ${rowIndex}`,
            `TimeIn${rowIndex}`,
            `Time_In${rowIndex}`,
            `time_in_${rowIndex}`,
            `TimeIn_${rowIndex}`,
            `Sign_In_Time${rowIndex}`,
            `SignIn_Time${rowIndex}`,
            `TIME_IN${rowIndex}`,
            `Arrival Time${rowIndex}`,
            `Start Time${rowIndex}`,
            `ArrivalTime${rowIndex}`,
            `StartTime${rowIndex}`,
            `In${rowIndex}`,
            `TimeInRow${rowIndex}`
          ];

          const timeOutPatterns = [
            `Time Out${rowIndex}`,
            `Time Out ${rowIndex}`,
            `TimeOut${rowIndex}`,
            `Time_Out${rowIndex}`,
            `time_out_${rowIndex}`,
            `TimeOut_${rowIndex}`,
            `Sign_Out_Time${rowIndex}`,
            `SignOut_Time${rowIndex}`,
            `TIME_OUT${rowIndex}`,
            `Departure Time${rowIndex}`,
            `End Time${rowIndex}`,
            `DepartureTime${rowIndex}`,
            `EndTime${rowIndex}`,
            `Out${rowIndex}`,
            `TimeOutRow${rowIndex}`
          ];

          const signInSigPatterns = [
            `Signature In${rowIndex}`,
            `Signature In ${rowIndex}`,
            `SignatureIn${rowIndex}`,
            `Sign_In_Signature${rowIndex}`,
            `signature_in_${rowIndex}`,
            `SignIn_Sig${rowIndex}`,
            `Worker_Signature_In${rowIndex}`,
            `SIG_IN${rowIndex}`,
            `Signature${rowIndex}`,
            `Sig_In${rowIndex}`,
            `SignIn${rowIndex}`,
            `WorkerSig${rowIndex}`,
            `Worker Signature${rowIndex}`,
            `CheckinSignature${rowIndex}`,
            `ArrivalSignature${rowIndex}`
          ];

          const signOutSigPatterns = [
            `Signature Out${rowIndex}`,
            `Signature Out ${rowIndex}`,
            `SignatureOut${rowIndex}`,
            `Sign_Out_Signature${rowIndex}`,
            `signature_out_${rowIndex}`,
            `SignOut_Sig${rowIndex}`,
            `Worker_Signature_Out${rowIndex}`,
            `SIG_OUT${rowIndex}`,
            `SignatureOut${rowIndex}`,
            `Sig_Out${rowIndex}`,
            `SignOut${rowIndex}`,
            `WorkerSigOut${rowIndex}`,
            `CheckoutSignature${rowIndex}`,
            `DepartureSignature${rowIndex}`,
            `EndSignature${rowIndex}`
          ];

          // Helper to try filling a field with multiple name patterns
          const tryFillField = (patterns: string[], value: string | undefined | null) => {
            if (!value) return;
            for (const pattern of patterns) {
              try {
                const field = form.getTextField(pattern);
                if (field) {
                  field.setText(value);
                  return; // Success
                }
              } catch (e) {
                // Try next pattern
              }
            }
          };

          // Fill worker data fields
          tryFillField(namePatterns, worker.name);
          tryFillField(classificationPatterns, worker.classification);
          tryFillField(timeInPatterns, worker.timeIn);
          tryFillField(timeOutPatterns, worker.timeOut);

          // Embed signatures
          for (const pattern of signInSigPatterns) {
            await embedSignatureInField(pattern, worker.signatureIn);
          }

          for (const pattern of signOutSigPatterns) {
            await embedSignatureInField(pattern, worker.signatureOut);
          }
        }
      }

      // Embed contractor representative signature if exists
      try {
        if (log.contractorRepSignature && log.contractorRepSignature.startsWith('data:image')) {
          const base64Data = log.contractorRepSignature.split(',')[1];
          if (base64Data) {
            const imageBytes = Buffer.from(base64Data, 'base64');
            const image = await pdfDoc.embedPng(imageBytes);
            // Place at signature field location (bottom left, typically)
            page.drawImage(image, {
              x: 50,
              y: 50,
              width: 80,
              height: 40
            });
          }
        }
      } catch (e) {
        console.log("Could not embed contractor rep signature");
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
