import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = [
    '/api/health',
    '/api/auth/callback',
                '/auth/callback',
    '/api/cron/',
    '/api/bridge/',
    '/api/webhooks/',
  ];

const STATIC_EXTENSIONS = ['.ico', '.png', '.jpg', '.svg', '.css', '.js', '.woff', '.woff2'];

function isPublicRoute(pathname: string): boolean {
    return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

function isStaticAsset(pathname: string): boolean {
    return STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext)) || pathname.startsWith('/_next');
}

function createSupabaseMiddlewareClient(req: NextRequest, res: NextResponse) {
    return createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
              cookies: {
                        getAll() {
                                    return req.cookies.getAll();
                        },
                        setAll(cookiesToSet) {
                                    cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
                                    cookiesToSet.forEach(({ name, value, options }) =>
                                                  res.cookies.set(name, value, options)
                                                                   );
                        },
              },
      }
        );
}

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

  // Skip static assets
  if (isStaticAsset(pathname)) {
        return NextResponse.next();
  }

  // Security headers for all responses
  const res = NextResponse.next({
        request: { headers: req.headers },
  });
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.headers.set('X-XSS-Protection', '1; mode=block');

  // Allow public routes without auth
  if (isPublicRoute(pathname)) {
        return res;
  }

  // Create Supabase client that reads/writes cookies on the request/response
  const supabase = createSupabaseMiddlewareClient(req, res);

  // IMPORTANT: Use getUser() instead of getSession() for security.
  // getUser() always validates the token with the Supabase Auth server,
  // whereas getSession() only reads from local storage/cookies without validation.
  const { data: { user }, error } = await supabase.auth.getUser();

  // Auth check for API routes
  if (pathname.startsWith('/api/')) {
        if (error || !user) {
                return NextResponse.json(
                  { success: false, error: 'unauthorized' },
                  { status: 401 }
                        );
        }
        return res;
  }

  // Non-API routes: check auth for dashboard, redirect to login if needed
  if (pathname.startsWith('/dashboard')) {
        if (error || !user) {
                const redirectUrl = new URL('/login', req.url);
                redirectUrl.searchParams.set('redirect', pathname);
                return NextResponse.redirect(redirectUrl);
        }
        return res;
  }

  return res;
}

export const config = {
    matcher: [
          '/((?!_next/static|_next/image|favicon.ico).*)',
        ],
};
