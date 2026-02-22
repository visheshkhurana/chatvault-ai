import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// Next.js Middleware — Rate Limiting & Security Headers
// ============================================================

// Simple in-memory rate limiter for API routes
const rateLimit = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
    '/api/search': { max: 30, windowMs: 60_000 },
    '/api/summarize': { max: 10, windowMs: 60_000 },
    '/api/webhook/whatsapp': { max: 200, windowMs: 60_000 },
    '/api/attachments': { max: 60, windowMs: 60_000 },
};

function getRateLimitConfig(pathname: string) {
    for (const [prefix, config] of Object.entries(RATE_LIMITS)) {
        if (pathname.startsWith(prefix)) return config;
    }
    return { max: 100, windowMs: 60_000 }; // default
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Only rate-limit API routes
    if (pathname.startsWith('/api/')) {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';
        const key = `${ip}:${pathname.split('/').slice(0, 4).join('/')}`;
        const config = getRateLimitConfig(pathname);
        const now = Date.now();

        const entry = rateLimit.get(key);
        if (!entry || entry.resetAt < now) {
            rateLimit.set(key, { count: 1, resetAt: now + config.windowMs });
        } else {
            entry.count++;
            if (entry.count > config.max) {
                return NextResponse.json(
                    { error: 'Too many requests. Please try again later.' },
                    {
                        status: 429,
                        headers: {
                            'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
                            'X-RateLimit-Limit': String(config.max),
                            'X-RateLimit-Remaining': '0',
                        },
                    }
                );
            }
        }
    }

    // Add security headers
    const response = NextResponse.next();
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
}

// Next.js requires this exact export name
export const config = {
    matcher: ['/api/:path*', '/dashboard/:path*'],
};

// Cleanup stale entries every 2 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of rateLimit) {
            if (entry.resetAt < now) rateLimit.delete(key);
        }
    }, 120_000);
}
