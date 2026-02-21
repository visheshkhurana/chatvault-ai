import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { queryRAG } from '@/lib/rag';

// ============================================================
// Search API - Dashboard search endpoint
// POST /api/search
// ============================================================

export async function POST(req: NextRequest) {
    try {
          // Authenticate user via Supabase session
      const supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
                  global: {
                              headers: { Authorization: req.headers.get('Authorization') || '' },
                  },
        }
            );

      const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (authError || !user) {
                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }

      // Get internal user ID
      const { data: dbUser } = await supabase
            .from('users')
            .select('id')
            .eq('auth_id', user.id)
            .single();

      if (!dbUser) {
              return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const body = await req.json();
          const { query, chatId, dateFrom, dateTo, maxResults } = body;

      if (!query || typeof query !== 'string') {
              return NextResponse.json({ error: 'Query is required' }, { status: 400 });
      }

      const result = await queryRAG({
              userId: dbUser.id,
              query,
              chatId,
              dateFrom,
              dateTo,
              maxResults: maxResults || 10,
              includeAttachments: true,
      });

      return NextResponse.json(result);
    } catch (error) {
          console.error('[Search API] Error:', error);
          return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
