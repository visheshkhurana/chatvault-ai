import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';

export const GET = withAuth(async (req: NextRequest, { user }) => {
    try {
          const url = new URL(req.url);
          const limit = parseInt(url.searchParams.get('limit') || '20');
          const { data, error } = await supabaseAdmin.from('relationship_scores').select('*').eq('user_id', user.id).order('score', { ascending: false }).limit(limit);
          if (error) throw error;
          return apiSuccess(data || []);
    } catch (err) { return apiError('Failed to fetch scores', 500); }
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
    try {
          const { data: contacts } = await supabaseAdmin.from('contacts').select('id, name, display_name').eq('user_id', user.id);
          if (!contacts || !contacts.length) return apiSuccess({ updated: 0 });
          const ago = new Date(); ago.setDate(ago.getDate() - 30);
          let updated = 0;
          for (const c of contacts) {
                  const { data: msgs } = await supabaseAdmin.from('messages').select('id, created_at, is_from_me').eq('user_id', user.id).eq('contact_id', c.id).gte('created_at', ago.toISOString()).order('created_at', { ascending: true });
                  if (!msgs || !msgs.length) continue;
                  const last = msgs[msgs.length - 1];
                  const recency = Math.max(0, 30 - ((Date.now() - new Date(last.created_at).getTime()) / 86400000));
                  const volume = Math.min(40, msgs.length * 2);
                  const score = Math.min(100, Math.round(recency + volume + 15));
                  await supabaseAdmin.from('relationship_scores').upsert({ user_id: user.id, contact_id: c.id, contact_name: c.display_name || c.name || 'Unknown', score, interaction_count: msgs.length, last_interaction_at: last.created_at, updated_at: new Date().toISOString() }, { onConflict: 'user_id,contact_id' });
                  updated++;
          }
          return apiSuccess({ updated, total: contacts.length });
    } catch (err) { return apiError('Failed to calculate scores', 500); }
});
