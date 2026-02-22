import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase';
import { z } from 'zod';

// ============================================================
// API Utilities — shared auth, error handling, rate limiting
// ============================================================

// --- Authenticated API Handler ---
// DRYs up the auth pattern shared by search, summarize, attachments, etc.

interface AuthenticatedContext {
    user: { id: string; authId: string; email?: string };
    supabase: SupabaseClient<any>;
}

type AuthenticatedHandler = (
    req: NextRequest,
    ctx: AuthenticatedContext,
) => Promise<NextResponse | Response>;

export function withAuth(handler: AuthenticatedHandler) {
    return async (req: NextRequest, routeCtx?: any) => {
        try {
            const supabase = createClient<any>(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                {
                    global: {
                        headers: { Authorization: req.headers.get('Authorization') || '' },
                    },
                }
            );

            const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
            if (authError || !authUser) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            // Look up internal user
            const { data: dbUser } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('auth_id', authUser.id)
                .single();

            if (!dbUser) {
                return NextResponse.json({ error: 'User not found' }, { status: 404 });
            }

            return await handler(req, {
                user: { id: dbUser.id, authId: authUser.id, email: authUser.email },
                supabase,
            });
        } catch (error) {
            console.error(`[API] Unhandled error:`, error);
            return apiError('Internal server error', 500);
        }
    };
}

// --- Validated Body Parser ---
export async function parseBody<T>(req: NextRequest, schema: z.ZodType<T, any, any>): Promise<
    { success: true; data: T } | { success: false; response: NextResponse }
> {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return { success: false, response: apiError('Invalid JSON body', 400) };
    }

    const result = schema.safeParse(body);
    if (!result.success) {
        const messages = result.error.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`).join('; ');
        return { success: false, response: apiError(messages, 400) };
    }
    return { success: true, data: result.data };
}

// --- Standard Error Responses ---
export function apiError(message: string, status: number = 500, details?: unknown) {
    return NextResponse.json(
        { error: message, ...(details ? { details } : {}) },
        { status }
    );
}

export function apiSuccess(data: unknown, status: number = 200) {
    return NextResponse.json(data, { status });
}

// --- Simple In-Memory Rate Limiter ---
// For production, replace with Redis/Upstash. This prevents abuse in dev/small deployments.

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_CLEANUP_INTERVAL = 60_000; // 1 minute
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
        if (entry.resetAt < now) rateLimitStore.delete(key);
    }
}, RATE_LIMIT_CLEANUP_INTERVAL);

export function checkRateLimit(
    key: string,
    maxRequests: number = 30,
    windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt < now) {
        rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
    }

    entry.count++;
    const allowed = entry.count <= maxRequests;
    return {
        allowed,
        remaining: Math.max(0, maxRequests - entry.count),
        resetAt: entry.resetAt,
    };
}
