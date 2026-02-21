import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseAnonKey);

      const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
                return NextResponse.redirect(new URL(next, request.url));
        }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(new URL('/login?error=auth-callback-error', request.url));
}
