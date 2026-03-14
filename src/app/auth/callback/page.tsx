'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function writeDebugLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  timestamp: number;
}) {
  void fetch('/api/debug-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        const code = queryParams.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (hashParams.get('access_token')) {
          const { error } = await supabase.auth.getSession();
          if (error) throw error;
        } else {
          throw new Error('No auth credentials found');
        }

        const next = queryParams.get('next') || '/dashboard';
        // Use full page navigation so the server sees the new auth cookies
        window.location.href = next;
      } catch (err: any) {
        console.error('Auth callback error:', err);
        const msg = encodeURIComponent(err?.message || String(err));
        // #region agent log
        writeDebugLog({
          hypothesisId: 'D',
          location: 'src/app/auth/callback/page.tsx:46',
          message: 'Redirecting callback failure to login',
          data: {
            errorMessage: err?.message || String(err),
            redirectUrl: '/login?error=auth-callback-error&message=' + msg,
            search: window.location.search,
            hash: window.location.hash,
          },
          timestamp: Date.now(),
        });
        // #endregion
        router.replace('/login?error=auth-callback-error&message=' + msg);
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-surface-600">Signing you in...</p>
      </div>
    </div>
  );
}
