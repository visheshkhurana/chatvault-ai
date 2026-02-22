import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Export & Backup API
// POST /api/export - Export chat data as JSON or CSV
// ============================================================

const exportSchema = z.object({
    chatId: z.string().uuid().optional(),
    format: z.enum(['json', 'csv']).default('json'),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    includeAttachments: z.boolean().optional().default(false),
    includeSummaries: z.boolean().optional().default(false),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, exportSchema);
    if (!parsed.success) return parsed.response;

    const { chatId, format, dateFrom, dateTo, includeAttachments, includeSummaries } = parsed.data as z.infer<typeof exportSchema>;

    // Fetch messages
    let msgQuery = supabaseAdmin
        .from('messages')
        .select('id, sender_name, sender_phone, text_content, message_type, is_from_me, timestamp, chat_id')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: true });

    if (chatId) msgQuery = msgQuery.eq('chat_id', chatId);
    if (dateFrom) msgQuery = msgQuery.gte('timestamp', dateFrom);
    if (dateTo) msgQuery = msgQuery.lte('timestamp', dateTo);

    const { data: messages, error: msgError } = await msgQuery.limit(10000);
    if (msgError) return apiError('Failed to fetch messages', 500);

    // Fetch chat info
    let chatQuery = supabaseAdmin
        .from('chats')
        .select('id, title, chat_type, category, participant_count, last_message_at, created_at')
        .eq('user_id', user.id);
    if (chatId) chatQuery = chatQuery.eq('id', chatId);
    const { data: chats } = await chatQuery;

    // Optionally fetch attachments
    let attachments: any[] = [];
    if (includeAttachments) {
        let attQuery = supabaseAdmin
            .from('attachments')
            .select('id, file_name, file_type, mime_type, file_size_bytes, ocr_text, transcript, created_at, message_id')
            .eq('user_id', user.id);
        if (chatId) {
            const messageIds = (messages || []).map((m: any) => m.id);
            if (messageIds.length > 0) {
                attQuery = attQuery.in('message_id', messageIds);
            }
        }
        const { data } = await attQuery.limit(5000);
        attachments = data || [];
    }

    // Optionally fetch summaries
    let summaries: any[] = [];
    if (includeSummaries) {
        let sumQuery = supabaseAdmin
            .from('chat_summaries')
            .select('id, chat_id, summary_type, summary_text, period_start, period_end, key_topics, action_items, created_at')
            .eq('user_id', user.id);
        if (chatId) sumQuery = sumQuery.eq('chat_id', chatId);
        const { data } = await sumQuery.limit(500);
        summaries = data || [];
    }

    if (format === 'csv') {
        const csvRows = [
            ['timestamp', 'chat_id', 'sender_name', 'sender_phone', 'message_type', 'is_from_me', 'text_content'].join(','),
        ];
        (messages || []).forEach((m: any) => {
            const escapeCsv = (val: string | null) => {
                if (!val) return '';
                return `"${val.replace(/"/g, '""')}"`;
            };
            csvRows.push([
                m.timestamp,
                m.chat_id,
                escapeCsv(m.sender_name),
                escapeCsv(m.sender_phone),
                m.message_type,
                String(m.is_from_me),
                escapeCsv(m.text_content),
            ].join(','));
        });

        return new Response(csvRows.join('\n'), {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="rememora-export-${new Date().toISOString().split('T')[0]}.csv"`,
            },
        });
    }

    // JSON export
    const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        user: { id: user.id, email: user.email },
        chats: chats || [],
        messages: messages || [],
        attachments: includeAttachments ? attachments : undefined,
        summaries: includeSummaries ? summaries : undefined,
        stats: {
            totalMessages: (messages || []).length,
            totalChats: (chats || []).length,
            totalAttachments: attachments.length,
            totalSummaries: summaries.length,
            dateRange: {
                from: dateFrom || (messages && messages[0]?.timestamp) || null,
                to: dateTo || (messages && messages[messages.length - 1]?.timestamp) || null,
            },
        },
    };

    return apiSuccess(exportData);
});
