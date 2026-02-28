import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import OpenAI from 'openai';
import { z } from 'zod';

// ============================================================
// Weekly Recap API
// GET /api/weekly-recap — Get latest weekly recap(s)
// POST /api/weekly-recap — Generate a new weekly recap
// ============================================================

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
});

const MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { data: recaps, error } = await supabaseAdmin
      .from('weekly_recaps')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(4);

    if (error) {
      console.error('[Weekly Recap] Query error:', error);
      return apiError('Failed to fetch recaps', 500);
    }

    return apiSuccess(recaps || []);
  } catch (err) {
    console.error('[Weekly Recap] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const generateRecapSchema = z.object({
  weekStart: z.string().datetime().optional(),
  weekEnd: z.string().datetime().optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, generateRecapSchema);
  if (!parsed.success) return parsed.response;

  const { weekStart: wsParam, weekEnd: weParam } =
    parsed.data as z.infer<typeof generateRecapSchema>;

  try {
    // Calculate week dates (default: last 7 days)
    const weekEnd = weParam ? new Date(weParam) : new Date();
    const weekStart = wsParam
      ? new Date(wsParam)
      : new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const weekStartStr = weekStart.toISOString();
    const weekEndStr = weekEnd.toISOString();

    // Get stats for past week
    const { count: messageCount } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('timestamp', weekStartStr)
      .lt('timestamp', weekEndStr);

    const { data: activeChats } = await supabaseAdmin
      .from('messages')
      .select('chat_id')
      .eq('user_id', user.id)
      .gte('timestamp', weekStartStr)
      .lt('timestamp', weekEndStr);

    const uniqueChats = new Set((activeChats || []).map((m) => m.chat_id)).size;

    const { count: commitmentsMade } = await supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', weekStartStr)
      .lt('created_at', weekEndStr);

    const { count: commitmentsCompleted } = await supabaseAdmin
      .from('commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('completed_at', weekStartStr)
      .lt('completed_at', weekEndStr);

    // Get top contacts
    const { data: topContacts } = await supabaseAdmin
      .from('contact_insights')
      .select('contact_name, total_messages')
      .eq('user_id', user.id)
      .order('total_messages', { ascending: false })
      .limit(5);

    // Generate LLM summary
    const prompt = `Generate a brief, warm weekly summary for a personal CRM app called Rememora. Use these stats:
- Messages: ${messageCount || 0}
- Active chats: ${uniqueChats}
- Commitments made: ${commitmentsMade || 0}
- Commitments completed: ${commitmentsCompleted || 0}
- Top contacts: ${topContacts?.map((c) => c.contact_name).join(', ') || 'none'}

Format the response as JSON:
{
  "summary": "2-3 sentence warm summary",
  "highlights": ["highlight 1", "highlight 2", "highlight 3"],
  "topTopics": ["topic 1", "topic 2"],
  "motivationalMessage": "encouraging message"
}`;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    });

    let summaryData = {
      summary: 'Great week! Keep up the momentum.',
      highlights: ['Active engagement', 'Good communication'],
      topTopics: ['conversations', 'commitments'],
      motivationalMessage: 'You are doing great!',
    };

    try {
      const content = response.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        summaryData = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Use defaults
    }

    // Store recap
    const { data: recap, error } = await supabaseAdmin
      .from('weekly_recaps')
      .insert({
        user_id: user.id,
        week_start: weekStartStr,
        week_end: weekEndStr,
        message_count: messageCount || 0,
        active_chats: uniqueChats,
        commitments_made: commitmentsMade || 0,
        commitments_completed: commitmentsCompleted || 0,
        summary_text: summaryData.summary,
        highlights: summaryData.highlights,
        key_topics: summaryData.topTopics,
        motivational_message: summaryData.motivationalMessage,
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Weekly Recap] Insert error:', error);
      return apiError('Failed to generate recap', 500);
    }

    return apiSuccess(recap, 201);
  } catch (err) {
    console.error('[Weekly Recap] Error:', err);
    return apiError('Failed to generate recap', 500);
  }
});
