import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_ROUTES = [
  '/api/health',
  '/api/auth/callback',
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

// Skip static assets
if (isStaticAsset(pathname)) {
  return NextResponse.next();
}

// Security headers for all responses
const res = NextResponse.next();
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-XSS-Protection', '1; mode=block');

// Allow public routes without auth
if (isPublicRoute(pathname)) {
  return res;
}

// Auth check for API routes
if (pathname.startsWith('/api/')) {
  try {
    const supabase = createMiddlewareClient({ req, res });
    const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 }
      );
  }

  return res;
  } catch (err) {
    // Auth check failed - treat as unauthorized, not server error
  console.error('[middleware] Auth error:', err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 }
      );
  }
}

// Non-API routes: check auth for dashboard, redirect to login if needed
if (pathname.startsWith('/dashboard')) {
  try {
    const supabase = createMiddlewareClient({ req, res });
    const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const redirectUrl = new URL('/login', req.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
  } catch {
    const redirectUrl = new URL('/login', req.url);
    return NextResponse.redirect(redirectUrl);
  }
}

return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
