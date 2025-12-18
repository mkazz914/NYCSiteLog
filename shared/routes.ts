import { z } from 'zod';
import { createLogSchema, dailyLogs, workers } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  logs: {
    create: {
      method: 'POST' as const,
      path: '/api/logs',
      input: createLogSchema,
      responses: {
        201: z.custom<typeof dailyLogs.$inferSelect & { workers: (typeof workers.$inferSelect)[] }>(),
        400: errorSchemas.validation,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/logs',
      responses: {
        200: z.array(z.custom<typeof dailyLogs.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/logs/:id',
      responses: {
        200: z.custom<typeof dailyLogs.$inferSelect & { workers: (typeof workers.$inferSelect)[] }>(),
        404: errorSchemas.notFound,
      },
    },
    exportPdf: {
      method: 'GET' as const,
      path: '/api/logs/:id/pdf',
      responses: {
        200: z.any(), // Returns binary PDF
        404: errorSchemas.notFound,
      },
    },
    clone: {
      method: 'POST' as const,
      path: '/api/logs/:id/clone',
      responses: {
        201: z.custom<typeof dailyLogs.$inferSelect & { workers: (typeof workers.$inferSelect)[] }>(),
        404: errorSchemas.notFound,
      },
    },
  },
  workers: {
    delete: {
      method: 'DELETE' as const,
      path: '/api/workers/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
