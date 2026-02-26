import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import { getDisplayName, isChatTitlePhoneNumber } from '@/lib/format-contact';

// ============================================================
// Suggestions API — Personalized chat suggestion chips
// GET /api/suggestions
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
    try {
        const suggestions: { text: string; icon: string }[] = [];

        // 1. Recent chats → "Summarize chat with [title]"
        const { data: recentChats } = await supabaseAdmin
            .from('chats')
            .select('id, title, chat_type, wa_chat_id')
            .eq('user_id', user.id)
            .order('last_message_at', { ascending: false })
            .limit(5);

        if (recentChats && recentChats.length > 0) {
            let chatSuggestionCount = 0;
            for (const chat of recentChats) {
                if (chatSuggestionCount >= 2) break;

                const chatName = chat.title || chat.wa_chat_id || '';

                // Skip chats that are just phone numbers — show friendly names only
                if (isChatTitlePhoneNumber(chatName)) continue;

                const displayName = getDisplayName(chatName, null);
                if (displayName && displayName !== 'Unknown' && displayName.length < 25) {
                    suggestions.push({
                        text: `Summarize chat with ${displayName}`,
                        icon: '📝',
                    });
                    chatSuggestionCount++;
                }
            }
        }

        // 2. Pending commitments count
        const { count: commitmentCount } = await supabaseAdmin
            .from('commitments')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'pending');

        if (commitmentCount && commitmentCount > 0) {
            suggestions.push({
                text: `Show my ${commitmentCount} pending commitment${commitmentCount > 1 ? 's' : ''}`,
                icon: '✅',
            });
        }

        // 3. Static suggestions
        suggestions.push({ text: 'What did I discuss recently?', icon: '🔍' });

        if (suggestions.length < 5) {
            suggestions.push({ text: 'Help', icon: '⚡' });
        }

        return apiSuccess({ suggestions: suggestions.slice(0, 5) });
    } catch (error) {
        console.error('[Suggestions API] Error:', error);
        // Return defaults on error
        return apiSuccess({
            suggestions: [
                { text: 'Show my commitments', icon: '✅' },
                { text: 'What did I discuss recently?', icon: '🔍' },
                { text: 'Help', icon: '⚡' },
            ],
        });
    }
});
