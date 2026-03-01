import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Memories API — "This Day" memories from previous years
// GET /api/memories - Fetch same month/day from previous years
// POST /api/memories - Mark memory as viewed/dismissed
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const currentYear = today.getFullYear();

  try {
    // Query messages from same month/day in previous years
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('id, chat_id, sender_name, text_content, timestamp, chats(title)')
      .eq('user_id', user.id)
      .gte('timestamp', `${currentYear - 3}-01-01T00:00:00`)
      .lt('timestamp', `${currentYear}-01-01T00:00:00Z`)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('[Memories] Query error:', error);
      return apiError('Failed to fetch memories', 500);
    }

    // Filter to same month/day and group by years_ago
    const grouped: Record<string, typeof messages> = {};

    if (messages) {
      for (const msg of messages) {
        const msgDate = new Date(msg.timestamp);
        const msgMonth = String(msgDate.getMonth() + 1).padStart(2, '0');
        const msgDay = String(msgDate.getDate()).padStart(2, '0');

        if (msgMonth === month && msgDay === day) {
          const yearsAgo = currentYear - msgDate.getFullYear();
          if (yearsAgo > 0 && yearsAgo <= 3) {
            const key = `${yearsAgo}_years_ago`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(msg);
          }
        }
      }
    }

    // Format response: limit 10 per year
    const result: Record<string, any> = {};
    for (const [key, msgs] of Object.entries(grouped)) {
      result[key] = msgs.slice(0, 10).map((m) => ({
        id: m.id,
        chatTitle: (m.chats as any)?.title || 'Unknown',
        senderName: m.sender_name,
        text: m.text_content,
        timestamp: m.timestamp,
      }));
    }

    return apiSuccess(result);
  } catch (err) {
    console.error('[Memories] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const markMemorySchema = z.object({
  memoryId: z.string().uuid(),
  action: z.enum(['view', 'dismiss']),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, markMemorySchema);
  if (!parsed.success) return parsed.response;

  const { memoryId, action } = parsed.data as z.infer<typeof markMemorySchema>;

  try {
    const { error } = await supabaseAdmin
      .from('memory_highlights')
      .upsert({
        user_id: user.id,
        message_id: memoryId,
        status: action === 'view' ? 'viewed' : 'dismissed',
        marked_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,message_id',
      });

    if (error) {
      console.error('[Memories] Update error:', error);
      return apiError('Failed to update memory', 500);
    }

    return apiSuccess({ success: true });
  } catch (err) {
    console.error('[Memories] Error:', err);
    return apiError('Internal server error', 500);
  }
});
