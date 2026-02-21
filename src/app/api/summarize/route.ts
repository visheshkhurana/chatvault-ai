import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { generateChatSummary } from '@/lib/rag';

// ============================================================
// Summarize API - Generate chat summaries
// POST /api/summarize
// ============================================================

export async function POST(req: NextRequest) {
    try {
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

      const { data: dbUser } = await supabase
            .from('users')
            .select('id')
            .eq('auth_id', user.id)
            .single();

      if (!dbUser) {
              return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const body = await req.json();
          const { chatId, days = 7 } = body;

      if (!chatId) {
              return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
      }

      const dateTo = new Date().toISOString();
          const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const result = await generateChatSummary({
              userId: dbUser.id,
              chatId,
              dateFrom,
              dateTo,
      });

      // Store the summary
      await supabaseAdmin.from('chat_summaries').insert({
              user_id: dbUser.id,
              chat_id: chatId,
              summary_type: days <= 1 ? 'daily' : 'weekly',
              summary_text: result.summary,
              period_start: dateFrom,
              period_end: dateTo,
              key_topics: result.keyTopics,
              action_items: result.actionItems,
      });

      return NextResponse.json(result);
    } catch (error) {
          console.error('[Summarize API] Error:', error);
          return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
