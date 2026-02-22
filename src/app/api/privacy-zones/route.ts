import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Selective Memory Zones API (Privacy Controls)
// GET /api/privacy-zones - List all privacy zones for the user
// POST /api/privacy-zones - Create a new privacy zone
// DELETE /api/privacy-zones - Remove a privacy zone
// ============================================================

// Expected privacy_zones table structure:
// CREATE TABLE privacy_zones (
//     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//     chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
//     contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
//     zone_type TEXT NOT NULL CHECK (zone_type IN ('exclude_from_search', 'exclude_from_summary', 'exclude_all')),
//     reason TEXT,
//     created_at TIMESTAMPTZ DEFAULT NOW(),
//     updated_at TIMESTAMPTZ DEFAULT NOW(),
//     UNIQUE(user_id, chat_id, contact_id, zone_type)
// );
// CREATE INDEX idx_privacy_zones_user_id ON privacy_zones(user_id);
// CREATE INDEX idx_privacy_zones_chat_id ON privacy_zones(chat_id);
// CREATE INDEX idx_privacy_zones_contact_id ON privacy_zones(contact_id);
// ALTER TABLE privacy_zones ENABLE ROW LEVEL SECURITY;
// CREATE POLICY privacy_zones_policy ON privacy_zones
//   FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

export const GET = withAuth(async (req: NextRequest, { user }) => {
    const { data: zones, error } = await supabaseAdmin
        .from('privacy_zones')
        .select(
            `
            id,
            chat_id,
            contact_id,
            zone_type,
            reason,
            created_at,
            updated_at,
            chat:chat_id(id, title),
            contact:contact_id(id, display_name)
            `
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[Privacy Zones API] Error fetching zones:', error);
        return apiError('Failed to fetch privacy zones', 500);
    }

    // Transform the response to flatten nested objects for easier consumption
    const transformedZones = (zones || []).map((zone: any) => ({
        id: zone.id,
        chatId: zone.chat_id,
        chatTitle: zone.chat?.[0]?.title || null,
        contactId: zone.contact_id,
        contactName: zone.contact?.[0]?.display_name || null,
        zoneType: zone.zone_type,
        reason: zone.reason,
        createdAt: zone.created_at,
        updatedAt: zone.updated_at,
    }));

    return apiSuccess({
        zones: transformedZones,
        total: transformedZones.length,
    });
});

const createPrivacyZoneSchema = z.object({
    chatId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    zoneType: z.enum(['exclude_from_search', 'exclude_from_summary', 'exclude_all']),
    reason: z.string().max(200).optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, createPrivacyZoneSchema);
    if (!parsed.success) return parsed.response;

    const { chatId, contactId, zoneType, reason } = parsed.data as z.infer<typeof createPrivacyZoneSchema>;

    // Validate that at least one of chatId or contactId is provided
    if (!chatId && !contactId) {
        return apiError('At least one of chatId or contactId must be provided', 400);
    }

    // Verify ownership of the chat if provided
    if (chatId) {
        const { data: chat } = await supabaseAdmin
            .from('chats')
            .select('id')
            .eq('id', chatId)
            .eq('user_id', user.id)
            .single();

        if (!chat) {
            return apiError('Chat not found or you do not have access to it', 404);
        }
    }

    // Verify ownership of the contact if provided
    if (contactId) {
        const { data: contact } = await supabaseAdmin
            .from('contacts')
            .select('id')
            .eq('id', contactId)
            .eq('user_id', user.id)
            .single();

        if (!contact) {
            return apiError('Contact not found or you do not have access to it', 404);
        }
    }

    // Upsert to avoid duplicates (on user_id + chat_id + contact_id + zone_type)
    const { data: zone, error } = await supabaseAdmin
        .from('privacy_zones')
        .upsert(
            {
                user_id: user.id,
                chat_id: chatId || null,
                contact_id: contactId || null,
                zone_type: zoneType,
                reason: reason || null,
                updated_at: new Date().toISOString(),
            },
            {
                onConflict: 'user_id,chat_id,contact_id,zone_type',
            }
        )
        .select()
        .single();

    if (error) {
        console.error('[Privacy Zones API] Error creating zone:', error);
        return apiError('Failed to create privacy zone', 500);
    }

    return apiSuccess({ zone }, 201);
});

const deletePrivacyZoneSchema = z.object({
    id: z.string().uuid(),
});

export const DELETE = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, deletePrivacyZoneSchema);
    if (!parsed.success) return parsed.response;

    const { id } = parsed.data as z.infer<typeof deletePrivacyZoneSchema>;

    const { error } = await supabaseAdmin
        .from('privacy_zones')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) {
        console.error('[Privacy Zones API] Error deleting zone:', error);
        return apiError('Failed to delete privacy zone', 500);
    }

    return apiSuccess({ success: true });
});
