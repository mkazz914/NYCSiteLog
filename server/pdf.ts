import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DailyLog, Worker } from "@shared/schema";

export type LogWithWorkers = DailyLog & { workers: Worker[] };

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "attached_assets",
  "NYCDDC_-_Sign_In_Sheet_APP_1766096042760.pdf"
);

// The official NYC DDC sign-in sheet used as the form template.
export function loadTemplate(): Buffer | null {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error("PDF template not found at:", TEMPLATE_PATH);
    return null;
  }
  return fs.readFileSync(TEMPLATE_PATH);
}

// Fills the sign-in sheet for one daily log (12 workers per page, extra pages as needed).
// Set opts.draft to stamp "DRAFT" on every page (used for unsigned logs in batch exports).
export async function buildLogPdf(
  log: LogWithWorkers,
  templateBytes: Buffer,
  opts: { draft?: boolean } = {}
): Promise<PDFDocument> {
  const workers = log.workers || [];
  const WORKERS_PER_PAGE = 12;
  const numPages = Math.max(1, Math.ceil(workers.length / WORKERS_PER_PAGE));
  
  const finalPdf = await PDFDocument.create();
  
  for (let pageNum = 0; pageNum < numPages; pageNum++) {
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    const page = pdfDoc.getPage(0);
    const draftFont = opts.draft ? await pdfDoc.embedFont(StandardFonts.HelveticaBold) : undefined;
  
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
  
    if (opts.draft && draftFont) {
      // Unsigned logs are clearly marked so they can't be mistaken for final sheets.
      // (The bottom 60pt of the template is empty, so this doesn't overlap the form.)
      page.drawText("DRAFT - NOT SIGNED BY CONTRACTOR REPRESENTATIVE", {
        x: 20,
        y: 30,
        size: 10,
        font: draftFont,
        color: rgb(0.75, 0, 0),
      });
    }

    form.flatten();
  
    const [copiedPage] = await finalPdf.copyPages(pdfDoc, [0]);
    finalPdf.addPage(copiedPage);
  }
  
  return finalPdf;
}
