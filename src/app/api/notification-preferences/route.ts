import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';

// Default preferences for new users
const DEFAULT_PREFERENCES = {
  digest_enabled: true,
  push_enabled: true,
  morning_digest: true,
  digest_time: '07:00',
  proactive_reminders: true,
  overdue_alerts: true,
  due_soon_alerts: true,
  weekly_summary: true,
};

// GET: Fetch user's notification preferences
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { data: prefs, error } = await supabaseAdmin
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (new user)
      throw error;
    }

    // Return existing prefs merged with defaults (for any new fields)
    const mergedPrefs = {
      ...DEFAULT_PREFERENCES,
      ...(prefs || {}),
    };

    return apiSuccess(mergedPrefs);
  } catch (error) {
    console.error('[NotificationPrefs GET] Error:', error);
    return apiError('Failed to fetch notification preferences', 500);
  }
});

// PATCH: Update notification preferences
export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json();

    // Validate fields — only allow known preference keys
    const allowedKeys = [
      'digest_enabled',
      'push_enabled',
      'morning_digest',
      'digest_time',
      'proactive_reminders',
      'overdue_alerts',
      'due_soon_alerts',
      'weekly_summary',
    ];

    const updates: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (key in body) {
        // Type validation
        if (key === 'digest_time') {
          if (typeof body[key] !== 'string' || !/^\d{2}:\d{2}$/.test(body[key])) {
            return apiError(`Invalid format for ${key}. Expected HH:MM.`, 400);
          }
          updates[key] = body[key];
        } else {
          if (typeof body[key] !== 'boolean') {
            return apiError(`Invalid type for ${key}. Expected boolean.`, 400);
          }
          updates[key] = body[key];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return apiError('No valid fields to update', 400);
    }

    // Upsert: create if not exists, update if exists
    const { data: existing } = await supabaseAdmin
      .from('notification_preferences')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      await supabaseAdmin
        .from('notification_preferences')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    } else {
      await supabaseAdmin
        .from('notification_preferences')
        .insert({
          user_id: user.id,
          ...DEFAULT_PREFERENCES,
          ...updates,
        });
    }

    // Fetch the updated row
    const { data: updatedPrefs } = await supabaseAdmin
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    return apiSuccess({
      ...DEFAULT_PREFERENCES,
      ...(updatedPrefs || {}),
    });
  } catch (error) {
    console.error('[NotificationPrefs PATCH] Error:', error);
    return apiError('Failed to update notification preferences', 500);
  }
});
