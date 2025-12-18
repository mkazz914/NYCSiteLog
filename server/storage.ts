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
}

export const storage = new DatabaseStorage();
