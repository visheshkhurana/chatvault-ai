import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase';
import { apiError, apiSuccess } from '@/lib/api-utils';

// ============================================================
// Cron Job: Auto-Generate Daily/Weekly Chat Summaries
// GET /api/cron/summaries?type=daily|weekly
// Protected by CRON_SECRET env var (Authorization header)
// ============================================================

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
});

const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

// --- Types ---

interface SummaryStats {
    totalUsersProcessed: number;
    totalChatsProcessed: number;
    summariesGenerated: number;
    summariesFailed: number;
    summariesSkipped: number;
    errors: Array<{ userId: string; chatId: string; error: string }>;
}

// --- Main Handler ---

export async function GET(req: NextRequest): Promise<NextResponse> {
    try {
        // Step 1: Verify CRON_SECRET
        const authHeader = req.headers.get('Authorization') || '';
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret) {
            return apiError('CRON_SECRET environment variable not configured', 500);
        }

        const token = authHeader.replace('Bearer ', '');
        if (token !== cronSecret) {
            return apiError('Unauthorized: Invalid CRON_SECRET', 401);
        }

        // Step 2: Determine summary type from query params
        const url = new URL(req.url);
        const summaryType = url.searchParams.get('type') as 'daily' | 'weekly' | null;

        if (!summaryType || !['daily', 'weekly'].includes(summaryType)) {
            return apiError(
                'Invalid or missing ?type parameter. Must be "daily" or "weekly"',
                400
            );
        }

        console.log(`[CRON] Starting ${summaryType} summary generation...`);

        // Step 3: Fetch users with relevant summary preference enabled
        const preferenceColumn =
            summaryType === 'daily' ? 'daily_summary' : 'weekly_summary';

        const { data: users, error: usersError } = await supabaseAdmin
            .from('notification_preferences')
            .select('user_id')
            .eq(preferenceColumn, true);

        if (usersError || !users) {
            return apiError(`Failed to fetch users with ${summaryType} summaries enabled`, 500);
        }

        if (users.length === 0) {
            return apiSuccess({
                message: `No users have ${summaryType} summaries enabled`,
                stats: {
                    totalUsersProcessed: 0,
                    totalChatsProcessed: 0,
                    summariesGenerated: 0,
                    summariesFailed: 0,
                    summariesSkipped: 0,
                    errors: [],
                },
            });
        }

        // Step 4: Process each user
        const stats: SummaryStats = {
            totalUsersProcessed: users.length,
            totalChatsProcessed: 0,
            summariesGenerated: 0,
            summariesFailed: 0,
            summariesSkipped: 0,
            errors: [],
        };

        for (const { user_id: userId } of users) {
            try {
                await processSummariesForUser(userId, summaryType, stats);
            } catch (error) {
                console.error(`[CRON] Error processing user ${userId}:`, error);
                stats.errors.push({
                    userId,
                    chatId: 'all',
                    error: String(error),
                });
            }
        }

        console.log(`[CRON] Completed ${summaryType} summary generation:`, stats);

        return apiSuccess({
            message: `${summaryType} summaries generated successfully`,
            stats,
        });
    } catch (error) {
        console.error('[CRON] Unhandled error:', error);
        return apiError('Internal server error', 500, String(error));
    }
}

// --- Helper: Process summaries for a single user ---

async function processSummariesForUser(
    userId: string,
    summaryType: 'daily' | 'weekly',
    stats: SummaryStats
): Promise<void> {
    // Calculate time period
    const now = new Date();
    const periodStart = new Date(
        summaryType === 'daily'
            ? now.getTime() - 24 * 60 * 60 * 1000 // Last 24 hours
            : now.getTime() - 7 * 24 * 60 * 60 * 1000 // Last 7 days
    );

    const periodStartISO = periodStart.toISOString();
    const periodEndISO = now.toISOString();

    // Fetch user's active chats from the period
    const { data: chats, error: chatsError } = await supabaseAdmin
        .from('chats')
        .select('id, title')
        .eq('user_id', userId)
        .gte('last_message_at', periodStartISO);

    if (chatsError || !chats) {
        throw new Error(`Failed to fetch chats for user ${userId}`);
    }

    if (chats.length === 0) {
        return; // No chats in the period
    }

    // Fetch privacy zones for this user (to filter excluded chats)
    const { data: privacyZones, error: zonesError } = await supabaseAdmin
        .from('privacy_zones')
        .select('chat_id, zone_type')
        .eq('user_id', userId);

    if (zonesError) {
        throw new Error(`Failed to fetch privacy zones for user ${userId}`);
    }

    // Build a set of excluded chat IDs
    const excludedChatIds = new Set<string>();
    if (privacyZones) {
        privacyZones.forEach((zone: any) => {
            if (
                zone.zone_type === 'exclude_from_summary' ||
                zone.zone_type === 'exclude_all'
            ) {
                excludedChatIds.add(zone.chat_id);
            }
        });
    }

    // Process each chat
    for (const chat of chats) {
        try {
            // Skip excluded chats
            if (excludedChatIds.has(chat.id)) {
                stats.summariesSkipped++;
                continue;
            }

            // Fetch messages for this chat in the period
            const { data: messages, error: messagesError } = await supabaseAdmin
                .from('messages')
                .select('id, text_content, sender_name, timestamp, message_type')
                .eq('user_id', userId)
                .eq('chat_id', chat.id)
                .gte('timestamp', periodStartISO)
                .lte('timestamp', periodEndISO)
                .eq('message_type', 'text') // Only text messages
                .order('timestamp', { ascending: true })
                .limit(1000);

            if (messagesError) {
                throw new Error(`Failed to fetch messages for chat ${chat.id}`);
            }

            // Filter messages with text content
            const textMessages = (messages || []).filter((m: any) => m.text_content);

            // Determine minimum message threshold
            const minMessages = summaryType === 'daily' ? 5 : 10;

            // Skip if not enough messages
            if (textMessages.length < minMessages) {
                stats.summariesSkipped++;
                continue;
            }

            // Generate summary using LLM
            const summaryResult = await generateSummaryFromMessages(
                textMessages,
                summaryType
            );

            // Check if a summary already exists for this period
            const { data: existingSummary } = await supabaseAdmin
                .from('chat_summaries')
                .select('id')
                .eq('user_id', userId)
                .eq('chat_id', chat.id)
                .eq('summary_type', summaryType)
                .gte('period_start', periodStartISO)
                .lte('period_end', periodEndISO)
                .single();

            if (existingSummary) {
                // Update existing summary
                const { error: updateError } = await supabaseAdmin
                    .from('chat_summaries')
                    .update({
                        summary_text: summaryResult.summary,
                        key_topics: summaryResult.keyTopics,
                        action_items: summaryResult.actionItems,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', existingSummary.id);

                if (updateError) {
                    throw updateError;
                }
            } else {
                // Insert new summary
                const { error: insertError } = await supabaseAdmin
                    .from('chat_summaries')
                    .insert({
                        user_id: userId,
                        chat_id: chat.id,
                        summary_type: summaryType,
                        summary_text: summaryResult.summary,
                        period_start: periodStartISO,
                        period_end: periodEndISO,
                        key_topics: summaryResult.keyTopics,
                        action_items: summaryResult.actionItems,
                        created_at: new Date().toISOString(),
                    });

                if (insertError) {
                    throw insertError;
                }
            }

            stats.summariesGenerated++;
            stats.totalChatsProcessed++;
        } catch (error) {
            console.error(
                `[CRON] Error generating summary for chat ${chat.id} (user ${userId}):`,
                error
            );
            stats.summariesFailed++;
            stats.errors.push({
                userId,
                chatId: chat.id,
                error: String(error),
            });
        }
    }
}

// --- Helper: Generate summary from messages ---

interface SummaryResult {
    summary: string;
    keyTopics: string[];
    actionItems: string[];
}

async function generateSummaryFromMessages(
    messages: Array<{ text_content: string; sender_name: string | null; timestamp: string }>,
    summaryType: 'daily' | 'weekly'
): Promise<SummaryResult> {
    // Format messages for LLM
    const formattedMessages = messages
        .map(
            (m: any) =>
                `[${new Date(m.timestamp).toLocaleString()}] ${m.sender_name || 'Unknown'}: ${m.text_content}`
        )
        .join('\n');

    const timeframeText = summaryType === 'daily' ? 'last 24 hours' : 'last 7 days';

    try {
        const completion = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `You are a professional conversation summarization assistant. Summarize the following WhatsApp conversation from the ${timeframeText}.

Provide your response in valid JSON format with exactly these fields:
{
  "summary": "A concise 2-3 paragraph summary of the key discussion points and outcomes",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "actionItems": ["action1", "action2"]
}

Guidelines:
- Summary should be clear and concise, capturing the essence of the conversation
- Key topics should be distinct themes or subjects discussed (limit to 5-7 items)
- Action items should be specific tasks, decisions, or follow-ups mentioned or implied
- If no action items are present, use an empty array
- Ensure all text is properly escaped for JSON`,
                },
                {
                    role: 'user',
                    content: `Please summarize this conversation:\n\n${formattedMessages}`,
                },
            ],
            temperature: 0.3,
            max_tokens: 1024,
            response_format: { type: 'json_object' },
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            return {
                summary: 'Summary generation failed: no content returned',
                keyTopics: [],
                actionItems: [],
            };
        }

        const parsed = JSON.parse(content);
        return {
            summary: parsed.summary || 'Unable to generate summary',
            keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
            actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        };
    } catch (error) {
        console.error('[CRON] Error calling LLM for summary:', error);
        if (error instanceof SyntaxError) {
            throw new Error(`Failed to parse LLM response: ${error.message}`);
        }
        throw error;
    }
}
