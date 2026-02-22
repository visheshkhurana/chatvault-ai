/**
 * Google OAuth2 — Initiate flow
 * GET /api/auth/google?userId=xxx
 * Redirects user to Google consent screen
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/google-calendar';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const authUrl = getGoogleAuthUrl(userId);
  return NextResponse.redirect(authUrl);
}
