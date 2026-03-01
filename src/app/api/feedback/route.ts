import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

export const GET = withAuth(async (req: NextRequest, { user }) => {
    try {
          const { data, error } = await supabaseAdmin.from('user_feedback').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20);
          if (error) throw error;
          return apiSuccess(data || []);
    } catch (err) { return apiError('Failed to fetch feedback', 500); }
});

const schema = z.object({
    feedback_type: z.enum(['nps', 'sean_ellis', 'feature_request', 'bug_report', 'general']).default('nps'),
    score: z.number().min(0).max(10).optional(),
    answer: z.string().optional(),
    question: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, schema);
    if (!parsed.success) return parsed.response;
    const body = parsed.data as z.infer<typeof schema>;
    try {
          const { data, error } = await supabaseAdmin.from('user_feedback').insert({
                  user_id: user.id, feedback_type: body.feedback_type, score: body.score, answer: body.answer, question: body.question, metadata: body.metadata || {},
          }).select().single();
          if (error) throw error;
          return apiSuccess(data, 201);
    } catch (err) { return apiError('Failed to submit feedback', 500); }
});
