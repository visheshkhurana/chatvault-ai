import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';

// ============================================================
// Single Contact Profile API
// GET /api/contacts/[id] - Full profile with context card
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
    const urlParts = req.nextUrl.pathname.split('/');
    const contactId = urlParts[urlParts.length - 1];

    if (!contactId) {
        return apiError('Contact ID required', 400);
    }

    // Fetch contact
    const { data: contact, error } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .eq('user_id', user.id)
        .single();

    if (error || !contact) {
        return apiError('Contact not found', 404);
    }

    // Fetch message stats
    const { data: messageStats } = await supabaseAdmin
        .from('messages')
        .select('id, timestamp, text_content, is_from_me, message_type')
        .eq('user_id', user.id)
        .eq('contact_id', contactId)
        .order('timestamp', { ascending: false })
        .limit(200);

    const messages = messageStats || [];
    const totalMessages = messages.length;
    const sentMessages = messages.filter((m: any) => m.is_from_me).length;
    const receivedMessages = totalMessages - sentMessages;
    const lastMessageAt = messages[0]?.timestamp || null;
    const firstMessageAt = messages[messages.length - 1]?.timestamp || null;

    // Recent topics (last 20 messages with text)
    const recentTexts = messages
        .filter((m: any) => m.text_content && m.text_content.length > 20)
        .slice(0, 20)
        .map((m: any) => m.text_content);

    // Shared chats
    const { data: sharedChats } = await supabaseAdmin
        .from('messages')
        .select('chat_id, chats(id, title, chat_type)')
        .eq('user_id', user.id)
        .eq('contact_id', contactId)
        .limit(100);

    const uniqueChats = new Map();
    (sharedChats || []).forEach((m: any) => {
        if (m.chats && !uniqueChats.has(m.chat_id)) {
            uniqueChats.set(m.chat_id, {
                id: m.chats.id,
                title: m.chats.title,
                chatType: m.chats.chat_type,
            });
        }
    });

    // Shared attachments count
    const { count: attachmentCount } = await supabaseAdmin
        .from('attachments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('message_id', messages.map((m: any) => m.id));

    // Message type breakdown
    const typeBreakdown: Record<string, number> = {};
    messages.forEach((m: any) => {
        typeBreakdown[m.message_type] = (typeBreakdown[m.message_type] || 0) + 1;
    });

    // Activity by day of week
    const activityByDay: Record<string, number> = {};
    messages.forEach((m: any) => {
        const day = new Date(m.timestamp).toLocaleDateString('en-US', { weekday: 'long' });
        activityByDay[day] = (activityByDay[day] || 0) + 1;
    });

    return apiSuccess({
        contact: {
            ...contact,
            stats: {
                totalMessages,
                sentMessages,
                receivedMessages,
                lastMessageAt,
                firstMessageAt,
                sharedAttachments: attachmentCount || 0,
                messageTypeBreakdown: typeBreakdown,
                activityByDay,
            },
            sharedChats: Array.from(uniqueChats.values()),
            recentTexts: recentTexts.slice(0, 5),
        },
    });
});
