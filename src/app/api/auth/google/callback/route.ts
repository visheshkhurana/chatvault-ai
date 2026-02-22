/**
 * Google OAuth2 — Callback handler
 * GET /api/auth/google/callback?code=xxx&state=userId
 * Exchanges code for tokens, stores in DB, redirects to dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeCodeForTokens } from '@/lib/google-calendar';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const userId = request.nextUrl.searchParams.get('state');

  if (!code || !userId) {
    return NextResponse.redirect(
      new URL('/dashboard?error=google_auth_failed', request.url)
    );
  }

  try {
    const success = await exchangeCodeForTokens(supabaseAdmin, code, userId);

    if (success) {
      return NextResponse.redirect(
        new URL('/dashboard?tab=settings&google=connected', request.url)
      );
    } else {
      return NextResponse.redirect(
        new URL('/dashboard?error=google_token_exchange_failed', request.url)
      );
    }
  } catch (error) {
    console.error('[GoogleAuth] Callback error:', error);
    return NextResponse.redirect(
      new URL('/dashboard?error=google_auth_error', request.url)
    );
  }
}
