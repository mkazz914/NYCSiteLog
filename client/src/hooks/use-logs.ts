import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type CreateLogRequest } from "@shared/routes";
import { dailyLogs, workers, type InsertWorker, type UpdateWorker, type UpdateLog, type SignLog } from "@shared/schema";

// Type inference from schema
export type DailyLog = typeof dailyLogs.$inferSelect;
export type Worker = typeof workers.$inferSelect;
export type DailyLogWithWorkers = DailyLog & { workers: Worker[] };

export function useLogs() {
  return useQuery({
    queryKey: [api.logs.list.path],
    queryFn: async () => {
      const res = await fetch(api.logs.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return api.logs.list.responses[200].parse(await res.json());
    },
  });
}

export function useLog(id: number) {
  return useQuery({
    queryKey: [api.logs.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.logs.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch log details");
      return api.logs.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateLogRequest) => {
      const validated = api.logs.create.input.parse(data);
      const res = await fetch(api.logs.create.path, {
        method: api.logs.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.logs.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create log");
      }
      return api.logs.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
    },
  });
}

export function useExportPdf(id: number) {
  return async () => {
    const url = buildUrl(api.logs.exportPdf.path, { id });
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Failed to generate PDF");
    
    // Create blob and trigger download
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `Sign_In_Sheet_${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
}

export function useCloneLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.logs.clone.path, { id });
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to clone log');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
    },
  });
}

export function useDeleteLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.logs.delete.path, { id });
      const res = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete log');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
    },
  });
}

export function useDeleteWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (workerId: number) => {
      const url = buildUrl(api.workers.delete.path, { id: workerId });
      const res = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete worker');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.logs.get.path] });
    },
  });
}

export function useAddWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, worker }: { logId: number; worker: InsertWorker }) => {
      const url = buildUrl(api.workers.create.path, { logId });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(worker),
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to add worker');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.logs.get.path] });
    },
  });
}

export function useUpdateWorker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workerId, data }: { workerId: number; data: UpdateWorker }) => {
      const url = buildUrl(api.workers.update.path, { id: workerId });
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update worker');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.logs.get.path] });
    },
  });
}

export function useUpdateLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, data }: { logId: number; data: UpdateLog }) => {
      const url = buildUrl(api.logs.update.path, { id: logId });
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update log');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.logs.get.path] });
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
    },
  });
}

export function useSignLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ logId, data }: { logId: number; data: SignLog }) => {
      const url = buildUrl(api.logs.sign.path, { id: logId });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to sign log');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.logs.get.path] });
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
    },
  });
}
