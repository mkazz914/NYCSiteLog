import { db } from "./db";
import {
  dailyLogs,
  workers,
  type DailyLog,
  type InsertDailyLog,
  type Worker,
  type InsertWorker,
  type CreateLogRequest
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  createLog(log: CreateLogRequest): Promise<DailyLog & { workers: Worker[] }>;
  getLogs(): Promise<DailyLog[]>;
  getLog(id: number): Promise<(DailyLog & { workers: Worker[] }) | undefined>;
  cloneLog(id: number): Promise<(DailyLog & { workers: Worker[] }) | undefined>;
  deleteWorker(workerId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async createLog(input: CreateLogRequest): Promise<DailyLog & { workers: Worker[] }> {
    // Transaction to ensure consistency
    return await db.transaction(async (tx) => {
      const { workers: workersList, ...logData } = input;
      
      const [newLog] = await tx.insert(dailyLogs).values(logData).returning();
      
      let newWorkers: Worker[] = [];
      if (workersList.length > 0) {
        const workersWithLogId = workersList.map(w => ({
          ...w,
          dailyLogId: newLog.id
        }));
        newWorkers = await tx.insert(workers).values(workersWithLogId).returning();
      }
      
      return { ...newLog, workers: newWorkers };
    });
  }

  async getLogs(): Promise<DailyLog[]> {
    return await db.select().from(dailyLogs).orderBy(dailyLogs.date);
  }

  async getLog(id: number): Promise<(DailyLog & { workers: Worker[] }) | undefined> {
    const [log] = await db.select().from(dailyLogs).where(eq(dailyLogs.id, id));
    
    if (!log) return undefined;
    
    const logWorkers = await db.select().from(workers).where(eq(workers.dailyLogId, id));
    
    return { ...log, workers: logWorkers };
  }

  async cloneLog(id: number): Promise<(DailyLog & { workers: Worker[] }) | undefined> {
    const existingLog = await this.getLog(id);
    if (!existingLog) return undefined;

    return await db.transaction(async (tx) => {
      // Create new log with same project info but today's date and no verification
      const [newLog] = await tx.insert(dailyLogs).values({
        primeContractor: existingLog.primeContractor,
        subcontractor: existingLog.subcontractor,
        contractNumber: existingLog.contractNumber,
        address: existingLog.address,
        agency: existingLog.agency,
        projectNameLocation: existingLog.projectNameLocation,
        date: new Date().toISOString().split('T')[0],
        contractorRepName: null,
        contractorRepTitle: null,
        contractorRepSignature: null,
        contractorRepDate: null,
      }).returning();

      // Clone workers with cleared signatures
      let newWorkers: Worker[] = [];
      if (existingLog.workers.length > 0) {
        const workersToInsert = existingLog.workers.map(w => ({
          dailyLogId: newLog.id,
          name: w.name,
          classification: w.classification,
          timeIn: w.timeIn,
          signatureIn: null,
          timeOut: null,
          signatureOut: null,
        }));
        newWorkers = await tx.insert(workers).values(workersToInsert).returning();
      }

      return { ...newLog, workers: newWorkers };
    });
  }

  async deleteWorker(workerId: number): Promise<boolean> {
    const result = await db.delete(workers).where(eq(workers.id, workerId)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
