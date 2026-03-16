import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

function getSafeNextPath(nextPath?: string | null): string {
    if (!nextPath) return '/dashboard';
    return nextPath.startsWith('/') ? nextPath : '/dashboard';
}

function loginErrorRedirect(request: NextRequest, message: string): NextResponse {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'auth-callback-error');
    loginUrl.searchParams.set('message', message);
    return NextResponse.redirect(loginUrl);
}

export async function GET(request: NextRequest) {
    const callbackError =
        request.nextUrl.searchParams.get('error_description') ||
        request.nextUrl.searchParams.get('message') ||
        request.nextUrl.searchParams.get('error');

    if (callbackError) {
        return loginErrorRedirect(request, callbackError);
    }

    const code = request.nextUrl.searchParams.get('code');
    if (!code) {
        return loginErrorRedirect(request, 'No auth code found in callback URL.');
    }

    const nextPath = getSafeNextPath(request.nextUrl.searchParams.get('next'));
    const redirectUrl = new URL(nextPath, request.url);

    // Create the redirect response FIRST so auth cookies
    // are attached to this exact response object.
    const response = NextResponse.redirect(redirectUrl);

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
            return loginErrorRedirect(request, error.message);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return loginErrorRedirect(request, message);
    }
    return response;
}
