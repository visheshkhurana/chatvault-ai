import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Proactive Alerts API
// GET /api/proactive-alerts — Fetch pending alerts
// POST /api/proactive-alerts — Create new alert
// PATCH /api/proactive-alerts — Update alert status
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const now = new Date().toISOString();

    const { data: alerts, error } = await supabaseAdmin
      .from('proactive_alerts')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('priority', { ascending: false })
      .order('scheduled_for', { ascending: true });

    if (error) {
      console.error('[Proactive Alerts] Query error:', error);
      return apiError('Failed to fetch alerts', 500);
    }

    return apiSuccess(alerts || []);
  } catch (err) {
    console.error('[Proactive Alerts] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const createAlertSchema = z.object({
  alertType: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  contextData: z.record(z.any()).optional(),
  relatedContact: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  scheduledFor: z.string().datetime().optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, createAlertSchema);
  if (!parsed.success) return parsed.response;

  const { alertType, title, body, contextData, relatedContact, priority, scheduledFor } =
    parsed.data as z.infer<typeof createAlertSchema>;

  try {
    const { data: alert, error } = await supabaseAdmin
      .from('proactive_alerts')
      .insert({
        user_id: user.id,
        alert_type: alertType,
        title,
        body,
        context_data: contextData || {},
        related_contact: relatedContact,
        priority,
        scheduled_for: scheduledFor || new Date().toISOString(),
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Proactive Alerts] Insert error:', error);
      return apiError('Failed to create alert', 500);
    }

    return apiSuccess(alert);
  } catch (err) {
    console.error('[Proactive Alerts] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const updateAlertSchema = z.object({
  alertId: z.string().uuid(),
  status: z.enum(['read', 'dismissed', 'acted_on']),
});

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, updateAlertSchema);
  if (!parsed.success) return parsed.response;

  const { alertId, status } = parsed.data as z.infer<typeof updateAlertSchema>;

  try {
    const { error } = await supabaseAdmin
      .from('proactive_alerts')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', alertId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Proactive Alerts] Update error:', error);
      return apiError('Failed to update alert', 500);
    }

    return apiSuccess({ success: true });
  } catch (err) {
    console.error('[Proactive Alerts] Error:', err);
    return apiError('Internal server error', 500);
  }
});
