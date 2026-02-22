import { z } from 'zod';

// ============================================================
// Input Validation Schemas (Zod)
// ============================================================

// --- Search API ---
export const searchSchema = z.object({
    query: z.string().min(1, 'Query is required').max(1000, 'Query too long'),
    chatId: z.string().uuid().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    maxResults: z.number().int().min(1).max(50).optional().default(10),
});

export type SearchInput = z.infer<typeof searchSchema>;

// --- Summarize API ---
export const summarizeSchema = z.object({
    chatId: z.string().uuid('Invalid chat ID'),
    days: z.number().int().min(1).max(90).optional().default(7),
});

export type SummarizeInput = z.infer<typeof summarizeSchema>;

// --- Webhook Payload (basic shape check) ---
export const webhookPayloadSchema = z.object({
    object: z.string(),
    entry: z.array(z.object({
        id: z.string(),
        changes: z.array(z.any()),
    })),
});

// --- Baileys Connection Config ---
export const baileysConfigSchema = z.object({
    port: z.number().int().min(1).max(65535).default(3001),
    syncHistoryDays: z.number().int().min(1).max(365).default(90),
    embeddingBatchSize: z.number().int().min(1).max(100).default(50),
});

// --- Chat Import CLI Args ---
export const chatImportSchema = z.object({
    filePath: z.string().min(1, 'File path is required'),
    chatName: z.string().min(1).optional(),
    myName: z.string().min(1).optional(),
});

// --- Utility: Validate and return typed result or error ---
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
    details: z.ZodIssue[];
} {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return {
        success: false,
        error: result.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; '),
        details: result.error.issues,
    };
}
