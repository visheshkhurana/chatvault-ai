import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { analyzeContact } from '@/lib/relationship-intelligence';
import { z } from 'zod';

// ============================================================
// Contact Insights API
// GET /api/contact-insights — Fetch insights for contact(s)
// POST /api/contact-insights — Trigger analysis for a contact
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const contact = searchParams.get('contact');
    const attention = searchParams.get('attention');

    if (contact) {
      // Fetch insights for specific contact
      const { data: insights, error } = await supabaseAdmin
        .from('contact_insights')
        .select('*')
        .eq('user_id', user.id)
        .eq('contact_phone', contact)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows found (expected)
        console.error('[Contact Insights] Query error:', error);
        return apiError('Failed to fetch insights', 500);
      }

      return apiSuccess(insights || {});
    }

    if (attention === 'true') {
      // Fetch contacts needing attention
      const { data: insights, error } = await supabaseAdmin
        .from('contact_insights')
        .select('*')
        .eq('user_id', user.id)
        .eq('needs_attention', true)
        .order('relationship_score', { ascending: false });

      if (error) {
        console.error('[Contact Insights] Query error:', error);
        return apiError('Failed to fetch insights', 500);
      }

      return apiSuccess(insights || []);
    }

    // Fetch top 10 contacts by relationship_score
    const { data: insights, error } = await supabaseAdmin
      .from('contact_insights')
      .select('*')
      .eq('user_id', user.id)
      .order('relationship_score', { ascending: false })
      .limit(10);

    if (error) {
      console.error('[Contact Insights] Query error:', error);
      return apiError('Failed to fetch insights', 500);
    }

    return apiSuccess(insights || []);
  } catch (err) {
    console.error('[Contact Insights] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const analyzeContactSchema = z.object({
  contactPhone: z.string().min(1),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, analyzeContactSchema);
  if (!parsed.success) return parsed.response;

  const { contactPhone } = parsed.data as z.infer<typeof analyzeContactSchema>;

  try {
    const result = await analyzeContact(user.id, contactPhone);
    return apiSuccess(result);
  } catch (err) {
    console.error('[Contact Insights] Analysis error:', err);
    return apiError('Failed to analyze contact', 500);
  }
});
