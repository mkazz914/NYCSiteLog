import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateLogRequest } from "@shared/routes";
import { dailyLogs, workers } from "@shared/schema";
import { z } from "zod";

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
