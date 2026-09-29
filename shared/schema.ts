import { pgTable, text, serial, integer, date, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export * from "./models/auth";

export const dailyLogs = pgTable("daily_logs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  primeContractor: text("prime_contractor").notNull(),
  subcontractor: text("subcontractor"),
  contractNumber: text("contract_number").notNull(),
  address: text("address").notNull(),
  agency: text("agency").notNull(),
  projectNameLocation: text("project_name_location").notNull(),
  date: date("date").notNull(),
  contractorRepName: text("contractor_rep_name"),
  contractorRepTitle: text("contractor_rep_title"),
  contractorRepSignature: text("contractor_rep_signature"), // Base64 data URL
  contractorRepDate: date("contractor_rep_date"),
});

export const workers = pgTable("workers", {
  id: serial("id").primaryKey(),
  dailyLogId: integer("daily_log_id").notNull(),
  name: text("name").notNull(),
  classification: text("classification").notNull(),
  timeIn: text("time_in").notNull(),
  signatureIn: text("signature_in"), // Base64 data URL
  timeOut: text("time_out"),
  signatureOut: text("signature_out"), // Base64 data URL
});

// Append-only history of actions taken on logs (who, what, when, from where).
export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    logId: integer("log_id"), // no foreign key on purpose: history outlives deleted logs
    userId: varchar("user_id").notNull(),
    userEmail: text("user_email"),
    action: text("action").notNull(),
    detail: text("detail"),
    ip: text("ip"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("IDX_audit_log_id").on(table.logId)]
);

export type AuditEvent = typeof auditEvents.$inferSelect;

export const dailyLogsRelations = relations(dailyLogs, ({ many }) => ({
  workers: many(workers),
}));

export const workersRelations = relations(workers, ({ one }) => ({
  dailyLog: one(dailyLogs, {
    fields: [workers.dailyLogId],
    references: [dailyLogs.id],
  }),
}));

export const insertDailyLogSchema = createInsertSchema(dailyLogs).omit({ id: true, userId: true });
export const insertWorkerSchema = createInsertSchema(workers).omit({ id: true, dailyLogId: true });

// Schema for updating a worker (partial update of editable fields)
export const updateWorkerSchema = z.object({
  timeIn: z.string().optional().nullable(),
  timeOut: z.string().optional().nullable(),
  signatureIn: z.string().optional().nullable(),
  signatureOut: z.string().optional().nullable(),
});

// Schema for updating a daily log (partial update of project info fields)
export const updateLogSchema = z.object({
  primeContractor: z.string().optional(),
  subcontractor: z.string().optional().nullable(),
  contractNumber: z.string().optional(),
  address: z.string().optional(),
  agency: z.string().optional(),
  projectNameLocation: z.string().optional(),
  date: z.string().optional(),
});

// Schema for signing/finalizing an unsigned log with contractor rep info
export const signLogSchema = z.object({
  contractorRepName: z.string().min(1, "Name is required"),
  contractorRepTitle: z.string().min(1, "Title is required"),
  contractorRepSignature: z.string().min(1, "Signature is required"),
  contractorRepDate: z.string().optional(),
});

// Combined schema for creating a log with workers
export const createLogSchema = insertDailyLogSchema.extend({
  workers: z.array(insertWorkerSchema),
});

export type DailyLog = typeof dailyLogs.$inferSelect;
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;
export type Worker = typeof workers.$inferSelect;
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type UpdateWorker = z.infer<typeof updateWorkerSchema>;
export type UpdateLog = z.infer<typeof updateLogSchema>;
export type SignLog = z.infer<typeof signLogSchema>;
export type CreateLogRequest = z.infer<typeof createLogSchema>;
