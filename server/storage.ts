import { db } from "./db";
import {
  dailyLogs,
  workers,
  type DailyLog,
  type InsertDailyLog,
  type Worker,
  type InsertWorker,
  type UpdateWorker,
  type UpdateLog,
  type SignLog,
  type CreateLogRequest
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  createLog(log: CreateLogRequest, userId: string): Promise<DailyLog & { workers: Worker[] }>;
  getLogs(userId: string): Promise<DailyLog[]>;
  getLog(id: number, userId: string): Promise<(DailyLog & { workers: Worker[] }) | undefined>;
  updateLog(id: number, data: UpdateLog, userId: string): Promise<DailyLog | undefined>;
  signLog(id: number, data: SignLog, userId: string): Promise<DailyLog | undefined>;
  cloneLog(id: number, userId: string): Promise<(DailyLog & { workers: Worker[] }) | undefined>;
  deleteLog(id: number, userId: string): Promise<boolean>;
  addWorker(logId: number, worker: InsertWorker, userId: string): Promise<Worker | undefined>;
  updateWorker(workerId: number, data: UpdateWorker, userId: string): Promise<Worker | undefined>;
  deleteWorker(workerId: number, userId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async createLog(input: CreateLogRequest, userId: string): Promise<DailyLog & { workers: Worker[] }> {
    return await db.transaction(async (tx) => {
      const { workers: workersList, ...logData } = input;
      
      const sanitizedLogData = {
        ...logData,
        userId,
        subcontractor: logData.subcontractor || null,
        contractorRepName: logData.contractorRepName || null,
        contractorRepTitle: logData.contractorRepTitle || null,
        contractorRepSignature: logData.contractorRepSignature || null,
        contractorRepDate: logData.contractorRepDate || null,
      };
      
      const [newLog] = await tx.insert(dailyLogs).values(sanitizedLogData).returning();
      
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

  async getLogs(userId: string): Promise<DailyLog[]> {
    return await db.select().from(dailyLogs).where(eq(dailyLogs.userId, userId)).orderBy(dailyLogs.date);
  }

  async getLog(id: number, userId: string): Promise<(DailyLog & { workers: Worker[] }) | undefined> {
    const [log] = await db.select().from(dailyLogs).where(and(eq(dailyLogs.id, id), eq(dailyLogs.userId, userId)));
    
    if (!log) return undefined;
    
    const logWorkers = await db.select().from(workers).where(eq(workers.dailyLogId, id));
    
    return { ...log, workers: logWorkers };
  }

  async updateLog(id: number, data: UpdateLog, userId: string): Promise<DailyLog | undefined> {
    const [existing] = await db.select().from(dailyLogs).where(and(eq(dailyLogs.id, id), eq(dailyLogs.userId, userId)));
    if (!existing) return undefined;

    const updateData: Partial<DailyLog> = {};
    if (data.primeContractor !== undefined) updateData.primeContractor = data.primeContractor;
    if (data.subcontractor !== undefined) updateData.subcontractor = data.subcontractor;
    if (data.contractNumber !== undefined) updateData.contractNumber = data.contractNumber;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.agency !== undefined) updateData.agency = data.agency;
    if (data.projectNameLocation !== undefined) updateData.projectNameLocation = data.projectNameLocation;
    if (data.date !== undefined) updateData.date = data.date;

    const [updated] = await db.update(dailyLogs)
      .set(updateData)
      .where(eq(dailyLogs.id, id))
      .returning();

    return updated;
  }

  async signLog(id: number, data: SignLog, userId: string): Promise<DailyLog | undefined> {
    const [existing] = await db.select().from(dailyLogs).where(and(eq(dailyLogs.id, id), eq(dailyLogs.userId, userId)));
    if (!existing) return undefined;

    // Don't allow signing an already-signed log
    if (existing.contractorRepSignature) return undefined;

    const [updated] = await db.update(dailyLogs)
      .set({
        contractorRepName: data.contractorRepName,
        contractorRepTitle: data.contractorRepTitle,
        contractorRepSignature: data.contractorRepSignature,
        contractorRepDate: data.contractorRepDate || new Date().toISOString().split('T')[0],
      })
      .where(eq(dailyLogs.id, id))
      .returning();

    return updated;
  }

  async cloneLog(id: number, userId: string): Promise<(DailyLog & { workers: Worker[] }) | undefined> {
    const existingLog = await this.getLog(id, userId);
    if (!existingLog) return undefined;

    return await db.transaction(async (tx) => {
      // Create new log with same project info but today's date and no verification
      const [newLog] = await tx.insert(dailyLogs).values({
        userId,
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

      let newWorkers: Worker[] = [];
      if (existingLog.workers.length > 0) {
        const workersToInsert = existingLog.workers.map(w => ({
          dailyLogId: newLog.id,
          name: w.name,
          classification: w.classification,
          timeIn: w.timeIn,
          signatureIn: w.signatureIn,
          timeOut: w.timeOut,
          signatureOut: w.signatureOut,
        }));
        newWorkers = await tx.insert(workers).values(workersToInsert).returning();
      }

      return { ...newLog, workers: newWorkers };
    });
  }

  async deleteLog(id: number, userId: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const [log] = await tx.select().from(dailyLogs).where(and(eq(dailyLogs.id, id), eq(dailyLogs.userId, userId)));
      if (!log) return false;
      await tx.delete(workers).where(eq(workers.dailyLogId, id));
      const result = await tx.delete(dailyLogs).where(eq(dailyLogs.id, id)).returning();
      return result.length > 0;
    });
  }

  async addWorker(logId: number, worker: InsertWorker, userId: string): Promise<Worker | undefined> {
    const [log] = await db.select().from(dailyLogs).where(and(eq(dailyLogs.id, logId), eq(dailyLogs.userId, userId)));
    if (!log) return undefined;
    
    const [newWorker] = await db.insert(workers).values({
      ...worker,
      dailyLogId: logId,
    }).returning();
    
    return newWorker;
  }

  async updateWorker(workerId: number, data: UpdateWorker, userId: string): Promise<Worker | undefined> {
    const [existing] = await db.select().from(workers).where(eq(workers.id, workerId));
    if (!existing) return undefined;
    
    // Verify the worker belongs to a log owned by this user
    const [log] = await db.select().from(dailyLogs).where(and(eq(dailyLogs.id, existing.dailyLogId), eq(dailyLogs.userId, userId)));
    if (!log) return undefined;
    
    const updateData: Partial<Worker> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.classification !== undefined) updateData.classification = data.classification;
    if (data.timeIn !== undefined) updateData.timeIn = data.timeIn || existing.timeIn;
    if (data.timeOut !== undefined) updateData.timeOut = data.timeOut;
    if (data.signatureIn !== undefined) updateData.signatureIn = data.signatureIn;
    if (data.signatureOut !== undefined) updateData.signatureOut = data.signatureOut;
    
    const [updated] = await db.update(workers)
      .set(updateData)
      .where(eq(workers.id, workerId))
      .returning();
    
    return updated;
  }

  async deleteWorker(workerId: number, userId: string): Promise<boolean> {
    const [existing] = await db.select().from(workers).where(eq(workers.id, workerId));
    if (!existing) return false;
    
    // Verify the worker belongs to a log owned by this user
    const [log] = await db.select().from(dailyLogs).where(and(eq(dailyLogs.id, existing.dailyLogId), eq(dailyLogs.userId, userId)));
    if (!log) return false;
    
    const result = await db.delete(workers).where(eq(workers.id, workerId)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
