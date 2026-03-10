'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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
      } catch (err) {
        console.error('Auth callback error:', err);
        router.replace('/login?error=auth-callback-error');
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
