import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { hybridSearch } from '@/lib/embeddings';
import { supabaseAdmin } from '@/lib/supabase';
import { classifyIntent, type ClassifiedIntent } from '@/lib/intent-classifier';
import { checkUsageLimit, incrementUsage } from '@/lib/billing';

// ============================================================
// Chat Assistant API - Intent-Routed Conversational AI
// POST /api/chat-assistant
// ============================================================

const chatAssistantSchema = z.object({
    messages: z.array(
        z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string().min(1).max(4000),
        })
    ).min(1, 'At least one message is required'),
    chatId: z.string().uuid().optional(),
});

type ChatAssistantInput = z.infer<typeof chatAssistantSchema>;

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
});

const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

// --- System Prompts by Intent ---

const SEARCH_SYSTEM_PROMPT = `You are Rememora Assistant, helping users explore their WhatsApp history.
Answer based strictly on the provided context from WhatsApp messages.
When referencing messages, include sender names and dates when available.
Keep responses concise and friendly. Never fabricate information.
If context doesn't contain enough information, say so clearly.
Reference specific messages by their number [1], [2], etc. when relevant.`;

const CASUAL_SYSTEM_PROMPT = `You are Rememora Assistant, a friendly AI helper for WhatsApp data.
The user is making casual conversation. Be warm, brief, and helpful.
If they seem to need help, suggest what you can do:
- Search their WhatsApp messages
- Show pending commitments
- Summarize conversations
- Find contacts or messages
Keep it short — 1-2 sentences max.`;

const COMMITMENT_SYSTEM_PROMPT = `You are Rememora Assistant. The user is asking about their commitments and promises.
Below is a list of their pending commitments extracted from WhatsApp conversations.
Present them clearly, grouped by priority if possible. Mention who made each commitment and any due dates.
Be concise and actionable.`;

// --- Interface Definitions ---

interface MessageSource {
    chatId: string;
    text: string;
    senderName?: string;
    timestamp?: string;
    chatTitle?: string;
}

interface EnhancedResponse {
    type: 'search' | 'commitments' | 'summary' | 'message';
    reply: string;
    sources?: MessageSource[];
    commitments?: any[];
    summary?: { text: string; keyTopics: string[]; actionItems: string[] };
    intent?: string;
}

// --- Main Handler ---

export const POST = withAuth(async (req: NextRequest, { user }) => {
    // Check usage limits
    const usage = await checkUsageLimit(user.id, 'assistant_count');
    if (!usage.allowed) {
        return apiError(
            `Daily assistant limit reached (${usage.current}/${usage.limit}). Upgrade to Pro for unlimited access.`,
            429
        );
    }

    const parsed = await parseBody(req, chatAssistantSchema);
    if (!parsed.success) return parsed.response;

    const { messages, chatId } = parsed.data as ChatAssistantInput;

    try {
        const userMessages = messages.filter((m) => m.role === 'user');
        if (userMessages.length === 0) {
            return apiError('No user message found in conversation', 400);
        }

        const latestUserMessage = userMessages[userMessages.length - 1].content;

        // Step 1: Classify intent
        let classified: ClassifiedIntent;
        try {
            classified = await classifyIntent(latestUserMessage);
        } catch (err) {
            console.error('[Chat Assistant] Intent classification failed, defaulting to question:', err);
            classified = { intent: 'question', confidence: 0.5, entities: { people: [], dates: [], documentTypes: [], topics: [], timeExpressions: [], contactReferences: [], fileTypes: [], quantities: [] }, originalMessage: latestUserMessage, suggestedQuery: latestUserMessage, requiresConfirmation: false };
        }

        console.log(`[Chat Assistant] Intent: ${classified.intent} (${classified.confidence}) for: "${latestUserMessage.substring(0, 60)}"`);

        // Step 2: Route by intent
        const conversationHistory = messages.map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        }));

        let response: EnhancedResponse;

        switch (classified.intent) {
            case 'casual':
                response = await handleCasual(latestUserMessage, conversationHistory);
                break;

            case 'commitment':
                response = await handleCommitments(latestUserMessage, user.id, conversationHistory);
                break;

            case 'command':
                response = handleCommand(latestUserMessage);
                break;

            case 'retrieval':
            case 'question':
            default:
                // Check if this is a summarization request
                const isSummarize = /\b(summarize|summary|summarise|recap|overview)\b/i.test(latestUserMessage);
                if (isSummarize && classified.entities.contactReferences.length > 0) {
                    response = await handleSummarize(latestUserMessage, user.id, classified, conversationHistory);
                } else {
                    response = await handleSearch(latestUserMessage, user.id, chatId, conversationHistory, classified);
                }
                break;
        }

        response.intent = classified.intent;

        // Increment usage counter on success
        await incrementUsage(user.id, 'assistant_count');

        return apiSuccess(response);

    } catch (error) {
        console.error('[Chat Assistant API] Error:', error);
        if (error instanceof Error) {
            if (error.message.includes('rate_limit')) {
                return apiError('Rate limit exceeded. Please try again in a moment.', 429);
            }
            if (error.message.includes('token')) {
                return apiError('Response too long. Please try a more specific query.', 400);
            }
        }
        return apiError('Failed to generate response. Please try again.', 500);
    }
});

// ============================================================
// Intent Handlers
// ============================================================

async function handleSearch(
    query: string,
    userId: string,
    chatId: string | undefined,
    conversationHistory: { role: string; content: string }[],
    classified: ClassifiedIntent
): Promise<EnhancedResponse> {
    // Use the classifier's suggested query if available (optimized for search)
    const searchQuery = classified.suggestedQuery || query;

    let searchResults: any[] = [];
    try {
        searchResults = await hybridSearch({
            userId,
            query: searchQuery,
            matchCount: 8,
            chatId,
        }) || [];
    } catch (searchError) {
        console.error('[Chat Assistant] Search error:', searchError);
    }

    const enrichedSources = await enrichSearchResults(searchResults, userId);

    const contextParts = enrichedSources.map((source, index) => {
        const parts = [`[${index + 1}]`, source.text];
        if (source.senderName) parts.push(`From: ${source.senderName}`);
        if (source.chatTitle) parts.push(`Chat: ${source.chatTitle}`);
        if (source.timestamp) {
            try {
                parts.push(`Date: ${new Date(source.timestamp).toLocaleDateString()}`);
            } catch { /* skip */ }
        }
        return parts.join(' | ');
    });

    const context = enrichedSources.length > 0
        ? `Relevant context from WhatsApp messages:\n\n${contextParts.join('\n\n')}`
        : 'No relevant messages found in your WhatsApp history.';

    const llmMessages = [
        { role: 'system' as const, content: SEARCH_SYSTEM_PROMPT },
        ...conversationHistory.slice(0, -1),
        { role: 'user' as const, content: `${context}\n\n---\n\nUser query: ${query}` },
    ];

    const completion = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: llmMessages as any,
        temperature: 0.7,
        max_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content || 'I could not generate a response.';

    const sources: MessageSource[] = enrichedSources.map((s) => ({
        chatId: s.chatId,
        text: s.text.substring(0, 300),
        senderName: s.senderName,
        timestamp: s.timestamp,
        chatTitle: s.chatTitle,
    }));

    return { type: 'search', reply, sources };
}

async function handleCommitments(
    query: string,
    userId: string,
    conversationHistory: { role: string; content: string }[]
): Promise<EnhancedResponse> {
    // Fetch pending commitments from DB
    const { data: commitments } = await supabaseAdmin
        .from('commitments')
        .select('id, title, committed_by, due_date, priority, status, chat_id, created_at')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20);

    const commitmentList = commitments || [];

    if (commitmentList.length === 0) {
        return {
            type: 'commitments',
            reply: "You don't have any pending commitments right now. I can scan your recent conversations for promises and deadlines — just ask!",
            commitments: [],
        };
    }

    // Build context for LLM to provide a natural summary
    const commitmentContext = commitmentList.map((c, i) =>
        `${i + 1}. "${c.title}" — by ${c.committed_by === 'me' ? 'You' : c.committed_by === 'them' ? 'Them' : 'Mutual'} | Priority: ${c.priority || 'medium'}${c.due_date ? ` | Due: ${new Date(c.due_date).toLocaleDateString()}` : ''}`
    ).join('\n');

    const llmMessages = [
        { role: 'system' as const, content: COMMITMENT_SYSTEM_PROMPT },
        ...conversationHistory.slice(0, -1),
        { role: 'user' as const, content: `Here are the pending commitments:\n\n${commitmentContext}\n\n---\n\nUser asked: ${query}` },
    ];

    const completion = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: llmMessages as any,
        temperature: 0.5,
        max_tokens: 512,
    });

    const reply = completion.choices[0]?.message?.content || `You have ${commitmentList.length} pending commitments.`;

    return { type: 'commitments', reply, commitments: commitmentList };
}

async function handleSummarize(
    query: string,
    userId: string,
    classified: ClassifiedIntent,
    conversationHistory: { role: string; content: string }[]
): Promise<EnhancedResponse> {
    // Try to find the chat that matches the contact reference
    const contactRef = classified.entities.contactReferences[0] || classified.entities.people[0] || '';

    let targetChat: any = null;
    if (contactRef) {
        const { data: chats } = await supabaseAdmin
            .from('chats')
            .select('id, title')
            .eq('user_id', userId)
            .ilike('title', `%${contactRef}%`)
            .limit(1);

        targetChat = chats?.[0];
    }

    if (!targetChat) {
        // Fall back to search-based response
        return handleSearch(query, userId, undefined, conversationHistory, classified);
    }

    // Fetch recent messages from that chat
    const { data: recentMessages } = await supabaseAdmin
        .from('messages')
        .select('sender_name, text_content, timestamp')
        .eq('chat_id', targetChat.id)
        .eq('user_id', userId)
        .not('text_content', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(100);

    if (!recentMessages || recentMessages.length === 0) {
        return { type: 'message', reply: `I couldn't find any recent messages in your chat with ${contactRef}. Make sure your WhatsApp is connected and messages are synced.` };
    }

    const msgContext = recentMessages.reverse().map(m =>
        `[${new Date(m.timestamp).toLocaleDateString()}] ${m.sender_name}: ${m.text_content}`
    ).join('\n');

    const llmMessages = [
        { role: 'system' as const, content: `You are Rememora Assistant. Summarize the following WhatsApp conversation. Provide: 1) A brief 2-3 paragraph summary, 2) Key topics discussed, 3) Any action items or follow-ups. Be concise and clear.` },
        { role: 'user' as const, content: `Conversation with ${targetChat.title}:\n\n${msgContext}\n\n---\n\nPlease summarize this conversation. Output as JSON: {"text": "...", "keyTopics": ["..."], "actionItems": ["..."]}` },
    ];

    const completion = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: llmMessages as any,
        temperature: 0.3,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '';
    let summaryData = { text: '', keyTopics: [] as string[], actionItems: [] as string[] };
    try {
        summaryData = JSON.parse(content);
    } catch {
        summaryData.text = content;
    }

    return {
        type: 'summary',
        reply: summaryData.text || `Here's a summary of your conversation with ${targetChat.title}.`,
        summary: {
            text: summaryData.text || content,
            keyTopics: summaryData.keyTopics || [],
            actionItems: summaryData.actionItems || [],
        },
    };
}

async function handleCasual(
    query: string,
    conversationHistory: { role: string; content: string }[]
): Promise<EnhancedResponse> {
    const llmMessages = [
        { role: 'system' as const, content: CASUAL_SYSTEM_PROMPT },
        ...conversationHistory.slice(-4), // Keep only last few messages for casual
    ];

    const completion = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: llmMessages as any,
        temperature: 0.8,
        max_tokens: 256,
    });

    const reply = completion.choices[0]?.message?.content || "Hey! I'm here to help you search and explore your WhatsApp messages. What would you like to find?";

    return { type: 'message', reply };
}

function handleCommand(message: string): EnhancedResponse {
    return {
        type: 'message',
        reply: `Here's what I can do for you:\n\n🔍 **Search** — Ask about any topic in your messages\n✅ **Commitments** — "Show my commitments" or "What did I promise?"\n📝 **Summarize** — "Summarize my chat with [name]"\n👥 **Contacts** — Ask about specific people\n💬 **General** — Ask me anything about your WhatsApp history\n\nJust type naturally — I'll understand what you need!`,
    };
}

// ============================================================
// Helper: Enrich search results with metadata
// ============================================================

async function enrichSearchResults(results: any[], userId: string) {
    if (results.length === 0) return [];

    const messageIds = results.filter((r) => r.message_id).map((r) => r.message_id);
    const chatIds = [...new Set(results.map((r) => r.chat_id))];

    let messageMap = new Map<string, any>();
    if (messageIds.length > 0) {
        const { data: messages } = await supabaseAdmin
            .from('messages')
            .select('id, sender_name, sender_phone, timestamp, chat_id')
            .in('id', messageIds);
        messageMap = new Map((messages || []).map((m) => [m.id, m]));
    }

    let chatMap = new Map<string, any>();
    if (chatIds.length > 0) {
        const { data: chats } = await supabaseAdmin
            .from('chats')
            .select('id, title')
            .in('id', chatIds);
        chatMap = new Map((chats || []).map((c) => [c.id, c]));
    }

    return results.map((r) => {
        const message = messageMap.get(r.message_id);
        const chat = chatMap.get(r.chat_id);
        return {
            chatId: r.chat_id,
            text: r.chunk_text || '',
            senderName: message?.sender_name || r.metadata?.sender_name,
            timestamp: message?.timestamp || r.metadata?.timestamp,
            chatTitle: chat?.title || 'Unknown Chat',
            messageId: r.message_id,
        };
    });
}
