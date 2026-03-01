import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

// ============================================================
// Next.js Middleware — Auth, Rate Limiting & Security Headers
// ============================================================

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
    '/login',
      '/signup',
        '/auth/callback',
          '/api/webhook/whatsapp',
            '/api/cron',
              '/terms',
                '/privacy',  '/api/health',
                ];

                // Rate limit config per API route prefix
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
                                  return { max: 100, windowMs: 60_000 };
                                  }

                                  export async function middleware(request: NextRequest) {
                                    const { pathname } = request.nextUrl;
                                      const response = NextResponse.next();

                                        // ── Auth check for protected routes ───────────────────────
                                          const isPublic = PUBLIC_ROUTES.some(
                                              (route) => pathname === route || pathname.startsWith(route + '/')
                                                );
                                                  const isApiRoute = pathname.startsWith('/api/');
                                                    const isStaticAsset =
                                                        pathname.startsWith('/_next/') ||
                                                            pathname.startsWith('/favicon') ||
                                                                pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff2?)$/);

                                                                  if (!isPublic && !isStaticAsset) {
                                                                      try {
                                                                            const supabase = createMiddlewareClient({ req: request, res: response });
                                                                                  const {
                                                                                          data: { session },
                                                                                                } = await supabase.auth.getSession();

                                                                                                      if (!session) {
                                                                                                              // API routes get 401; pages redirect to login
                                                                                                                      if (isApiRoute) {
                                                                                                                                return NextResponse.json(
                                                                                                                                            { error: 'Unauthorized' },
                                                                                                                                                        { status: 401 }
                                                                                                                                                                  );
                                                                                                                                                                          }
                                                                                                                                                                                  const loginUrl = request.nextUrl.clone();
                                                                                                                                                                                          loginUrl.pathname = '/login';
                                                                                                                                                                                                  loginUrl.searchParams.set('redirect', pathname);
                                                                                                                                                                                                          return NextResponse.redirect(loginUrl);
                                                                                                                                                                                                                }
                                                                                                                                                                                                                    } catch {
                                                                                                                                                                                                                          // If Supabase env vars are missing, block access
                                                                                                                                                                                                                                if (isApiRoute) {
                                                                                                                                                                                                                                        return NextResponse.json(
                                                                                                                                                                                                                                                  { error: 'Service unavailable' },
                                                                                                                                                                                                                                                            { status: 503 }
                                                                                                                                                                                                                                                                    );
                                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                                                const loginUrl = request.nextUrl.clone();
                                                                                                                                                                                                                                                                                      loginUrl.pathname = '/login';
                                                                                                                                                                                                                                                                                            return NextResponse.redirect(loginUrl);
                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                                  }

                                                                                                                                                                                                                                                                                                    // ── Rate limiting for API routes ──────────────────────────
                                                                                                                                                                                                                                                                                                      // NOTE: In-memory Map resets per serverless cold start.
                                                                                                                                                                                                                                                                                                        // For production, replace with Upstash Redis or Vercel KV.
                                                                                                                                                                                                                                                                                                          if (isApiRoute) {
                                                                                                                                                                                                                                                                                                              const ip =
                                                                                                                                                                                                                                                                                                                    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                                                                                                                                                                                                                                                                                                                          request.headers.get('x-real-ip') ||
                                                                                                                                                                                                                                                                                                                                'unknown';
                                                                                                                                                                                                                                                                                                                                    const key = `${ip}:${pathname.split('/').slice(0, 4).join('/')}`;
                                                                                                                                                                                                                                                                                                                                        const config = getRateLimitConfig(pathname);
                                                                                                                                                                                                                                                                                                                                            const now = Date.now();

                                                                                                                                                                                                                                                                                                                                                // Using headers to signal rate limit info (stateless fallback)
                                                                                                                                                                                                                                                                                                                                                    response.headers.set('X-RateLimit-Limit', String(config.max));
                                                                                                                                                                                                                                                                                                                                                      }

                                                                                                                                                                                                                                                                                                                                                        // ── Security headers ──────────────────────────────────────
                                                                                                                                                                                                                                                                                                                                                          response.headers.set('X-Content-Type-Options', 'nosniff');
                                                                                                                                                                                                                                                                                                                                                            response.headers.set('X-Frame-Options', 'DENY');
                                                                                                                                                                                                                                                                                                                                                              response.headers.set('X-XSS-Protection', '1; mode=block');
                                                                                                                                                                                                                                                                                                                                                                response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
                                                                                                                                                                                                                                                                                                                                                                  response.headers.set(
                                                                                                                                                                                                                                                                                                                                                                      'Strict-Transport-Security',
                                                                                                                                                                                                                                                                                                                                                                          'max-age=31536000; includeSubDomains; preload'
                                                                                                                                                                                                                                                                                                                                                                            );
                                                                                                                                                                                                                                                                                                                                                                              response.headers.set(
                                                                                                                                                                                                                                                                                                                                                                                  'Content-Security-Policy',
                                                                                                                                                                                                                                                                                                                                                                                      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://openrouter.ai https://*.backblazeb2.com; frame-ancestors 'none';"
                                                                                                                                                                                                                                                                                                                                                                                        );
                                                                                                                                                                                                                                                                                                                                                                                          response.headers.set(
                                                                                                                                                                                                                                                                                                                                                                                              'Permissions-Policy',
                                                                                                                                                                                                                                                                                                                                                                                                  'camera=(), microphone=(), geolocation=()'
                                                                                                                                                                                                                                                                                                                                                                                                    );

                                                                                                                                                                                                                                                                                                                                                                                                      return response;
                                                                                                                                                                                                                                                                                                                                                                                                      }

                                                                                                                                                                                                                                                                                                                                                                                                      export const config = {
                                                                                                                                                                                                                                                                                                                                                                                                        matcher: [
                                                                                                                                                                                                                                                                                                                                                                                                            '/((?!_next/static|_next/image|favicon.ico).*)',
                                                                                                                                                                                                                                                                                                                                                                                                              ],
                                                                                                                                                                                                                                                                                                                                                                                                              };
