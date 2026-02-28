import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Special Dates API
// GET /api/special-dates — List all special dates
// POST /api/special-dates — Add a special date manually
// PATCH /api/special-dates — Update a special date
// DELETE /api/special-dates — Remove a special date
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { data: dates, error } = await supabaseAdmin
      .from('special_dates')
      .select('*')
      .eq('user_id', user.id)
      .order('date_value', { ascending: true });

    if (error) {
      console.error('[Special Dates] Query error:', error);
      return apiError('Failed to fetch special dates', 500);
    }

    return apiSuccess(dates || []);
  } catch (err) {
    console.error('[Special Dates] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const addDateSchema = z.object({
  contactName: z.string().min(1),
  contactPhone: z.string().optional(),
  dateType: z.enum(['birthday', 'anniversary', 'other']),
  dateValue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  yearKnown: z.boolean().optional().default(true),
  reminderDaysBefore: z.number().int().min(0).max(365).optional().default(7),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, addDateSchema);
  if (!parsed.success) return parsed.response;

  const { contactName, contactPhone, dateType, dateValue, yearKnown, reminderDaysBefore } =
    parsed.data as z.infer<typeof addDateSchema>;

  try {
    const { data: date, error } = await supabaseAdmin
      .from('special_dates')
      .insert({
        user_id: user.id,
        contact_name: contactName,
        contact_phone: contactPhone,
        date_type: dateType,
        date_value: dateValue,
        year_known: yearKnown,
        reminder_days_before: reminderDaysBefore,
        reminder_enabled: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Special Dates] Insert error:', error);
      return apiError('Failed to add date', 500);
    }

    return apiSuccess(date, 201);
  } catch (err) {
    console.error('[Special Dates] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const updateDateSchema = z.object({
  dateId: z.string().uuid(),
  reminderEnabled: z.boolean().optional(),
  reminderDaysBefore: z.number().int().min(0).max(365).optional(),
  suggestedMessage: z.string().optional(),
});

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, updateDateSchema);
  if (!parsed.success) return parsed.response;

  const { dateId, reminderEnabled, reminderDaysBefore, suggestedMessage } =
    parsed.data as z.infer<typeof updateDateSchema>;

  try {
    const updates: Record<string, any> = {};
    if (reminderEnabled !== undefined) updates.reminder_enabled = reminderEnabled;
    if (reminderDaysBefore !== undefined) updates.reminder_days_before = reminderDaysBefore;
    if (suggestedMessage !== undefined) updates.suggested_message = suggestedMessage;

    const { error } = await supabaseAdmin
      .from('special_dates')
      .update(updates)
      .eq('id', dateId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Special Dates] Update error:', error);
      return apiError('Failed to update date', 500);
    }

    return apiSuccess({ success: true });
  } catch (err) {
    console.error('[Special Dates] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const deleteDateSchema = z.object({
  dateId: z.string().uuid(),
});

export const DELETE = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, deleteDateSchema);
  if (!parsed.success) return parsed.response;

  const { dateId } = parsed.data as z.infer<typeof deleteDateSchema>;

  try {
    const { error } = await supabaseAdmin
      .from('special_dates')
      .delete()
      .eq('id', dateId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Special Dates] Delete error:', error);
      return apiError('Failed to delete date', 500);
    }

    return apiSuccess({ success: true });
  } catch (err) {
    console.error('[Special Dates] Error:', err);
    return apiError('Internal server error', 500);
  }
});
