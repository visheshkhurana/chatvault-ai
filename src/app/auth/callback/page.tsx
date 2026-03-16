import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

type CallbackSearchParams = {
    code?: string;
    next?: string;
    error?: string;
    error_description?: string;
    message?: string;
};

function loginErrorRedirect(message: string): never {
    redirect(`/login?error=auth-callback-error&message=${encodeURIComponent(message)}`);
}

function getSafeNextPath(nextPath?: string): string {
    if (!nextPath) return '/dashboard';
    return nextPath.startsWith('/') ? nextPath : '/dashboard';
}

export default async function AuthCallbackPage({
    searchParams,
}: {
    searchParams: CallbackSearchParams;
}) {
    const callbackError =
        searchParams.error_description || searchParams.message || searchParams.error;

    if (callbackError) {
        loginErrorRedirect(callbackError);
    }

    const code = searchParams.code;
    const nextPath = getSafeNextPath(searchParams.next);

    if (!code) {
        loginErrorRedirect('No auth code found in callback URL.');
    }

    const cookieStore = cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name) {
                    return cookieStore.get(name)?.value;
                },
                set(name, value, options) {
                    cookieStore.set({ name, value, ...options });
                },
                remove(name, options) {
                    cookieStore.set({ name, value: '', ...options, maxAge: 0 });
                },
            },
        }
    );

    try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
            loginErrorRedirect(error.message);
        }
        redirect(nextPath);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        loginErrorRedirect(message);
    }
}
