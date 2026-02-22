import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ============================================================
// Health Check Endpoint
// GET /api/health
// ============================================================

export async function GET() {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // Check Supabase connectivity
    const supabaseStart = Date.now();
    try {
        const { error } = await supabaseAdmin
            .from('users')
            .select('id')
            .limit(1);

        checks.supabase = error
            ? { status: 'unhealthy', error: error.message, latencyMs: Date.now() - supabaseStart }
            : { status: 'healthy', latencyMs: Date.now() - supabaseStart };
    } catch (err) {
        checks.supabase = {
            status: 'unhealthy',
            error: err instanceof Error ? err.message : 'Unknown error',
            latencyMs: Date.now() - supabaseStart,
        };
    }

    // Check OpenRouter / LLM API reachability
    const llmStart = Date.now();
    try {
        const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            checks.llm = { status: 'unconfigured', error: 'No API key set' };
        } else {
            // Light ping — just check the models endpoint
            const baseUrl = process.env.OPENROUTER_API_KEY
                ? 'https://openrouter.ai/api/v1'
                : 'https://api.openai.com/v1';
            const res = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(5000),
            });
            checks.llm = {
                status: res.ok ? 'healthy' : 'degraded',
                latencyMs: Date.now() - llmStart,
                ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
            };
        }
    } catch (err) {
        checks.llm = {
            status: 'unhealthy',
            error: err instanceof Error ? err.message : 'Unknown error',
            latencyMs: Date.now() - llmStart,
        };
    }

    // Check required env vars
    const requiredEnvVars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
    ];
    const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);
    checks.config = missingEnvVars.length === 0
        ? { status: 'healthy' }
        : { status: 'unhealthy', error: `Missing: ${missingEnvVars.join(', ')}` };

    // Overall status
    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
    const anyUnhealthy = Object.values(checks).some(c => c.status === 'unhealthy');

    return NextResponse.json(
        {
            status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
            checks,
        },
        { status: anyUnhealthy ? 503 : 200 }
    );
}
