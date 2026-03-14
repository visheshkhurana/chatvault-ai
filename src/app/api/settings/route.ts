import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// User Settings API
// GET /api/settings - Get user settings
// POST /api/settings - Update user settings
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
    // Fetch user settings
    const { data: userData, error } = await supabaseAdmin
        .from('users')
        .select('display_name, timezone, data_retention_days, settings, google_access_token')
        .eq('id', user.id)
        .single();

    if (error) {
        return apiError('Failed to fetch settings', 500);
    }

    // Fetch privacy zones (excluded chats)
    const { data: privacyZones } = await supabaseAdmin
        .from('privacy_zones')
        .select('id, chat_id, contact_id, zone_type, created_at, chats(title), contacts(display_name)')
        .eq('user_id', user.id);

    // Fetch notification preferences (table references auth.users(id))
    const { data: notifications } = await supabaseAdmin
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.authId)
        .single();

    const notifDefaults = {
        daily_summary: true,
        weekly_summary: true,
        commitment_alerts: true,
        summary_time: '09:00',
        summary_timezone: userData?.timezone || 'UTC',
    };

    return apiSuccess({
        profile: {
            displayName: userData?.display_name,
            email: user.email,
            timezone: userData?.timezone || 'UTC',
            dataRetentionDays: userData?.data_retention_days || 365,
            googleCalendarConnected: !!userData?.google_access_token,
        },
        settings: userData?.settings || {},
        privacyZones: privacyZones || [],
        notifications: notifications
            ? {
                daily_summary: notifications.daily_summary,
                weekly_summary: notifications.weekly_summary,
                commitment_alerts: notifications.commitment_alerts,
                summary_time: notifications.summary_time,
                summary_timezone: notifications.summary_timezone,
              }
            : notifDefaults,
    });
});

const updateSettingsSchema = z.object({
    displayName: z.string().max(100).optional(),
    timezone: z.string().max(50).optional(),
    dataRetentionDays: z.number().int().min(30).max(3650).optional(),
    settings: z.object({
        theme: z.enum(['light', 'dark', 'system']).optional(),
        language: z.string().max(10).optional(),
        aiModel: z.string().max(100).optional(),
        searchResultsPerPage: z.number().int().min(5).max(50).optional(),
        autoSummarize: z.boolean().optional(),
        showReadReceipts: z.boolean().optional(),
    }).optional(),
    notifications: z.object({
        dailySummary: z.boolean().optional(),
        weeklySummary: z.boolean().optional(),
        commitmentAlerts: z.boolean().optional(),
        summaryTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        summaryTimezone: z.string().max(50).optional(),
    }).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
    // Handle Google Calendar disconnect separately (not in schema)
    const rawBody = await req.clone().json().catch(() => ({}));
    if (rawBody.disconnectGoogleCalendar) {
        const { error } = await supabaseAdmin
            .from('users')
            .update({
                google_access_token: null,
                google_refresh_token: null,
                google_token_expiry: null,
            })
            .eq('id', user.id);
        if (error) {
            console.error('[Settings] Error disconnecting Google Calendar:', error);
            return apiError('Failed to disconnect Google Calendar', 500);
        }
        return apiSuccess({ success: true, googleCalendarDisconnected: true });
    }

    const parsed = await parseBody(req, updateSettingsSchema);
    if (!parsed.success) return parsed.response;

    const { displayName, timezone, dataRetentionDays, settings, notifications } = parsed.data as z.infer<typeof updateSettingsSchema>;

    // Update user profile fields
    const userUpdates: Record<string, any> = {};
    if (displayName !== undefined) userUpdates.display_name = displayName;
    if (timezone !== undefined) userUpdates.timezone = timezone;
    if (dataRetentionDays !== undefined) userUpdates.data_retention_days = dataRetentionDays;
    if (settings !== undefined) userUpdates.settings = settings;

    if (Object.keys(userUpdates).length > 0) {
        const { error } = await supabaseAdmin
            .from('users')
            .update(userUpdates)
            .eq('id', user.id);
        if (error) {
            console.error('[Settings] Error updating user:', error);
            return apiError('Failed to update settings', 500);
        }
    }

    // Update notification preferences
    if (notifications) {
        const notifRow: Record<string, any> = {
            user_id: user.authId,
            updated_at: new Date().toISOString(),
        };
        if (notifications.dailySummary !== undefined) notifRow.daily_summary = notifications.dailySummary;
        if (notifications.weeklySummary !== undefined) notifRow.weekly_summary = notifications.weeklySummary;
        if (notifications.commitmentAlerts !== undefined) notifRow.commitment_alerts = notifications.commitmentAlerts;
        if (notifications.summaryTime !== undefined) notifRow.summary_time = notifications.summaryTime;
        if (notifications.summaryTimezone !== undefined) notifRow.summary_timezone = notifications.summaryTimezone;

        const { error } = await supabaseAdmin
            .from('notification_preferences')
            .upsert(notifRow, { onConflict: 'user_id' });
        if (error) {
            console.error('[Settings] Error updating notifications:', error);
        }
    }

    return apiSuccess({ success: true });
});
