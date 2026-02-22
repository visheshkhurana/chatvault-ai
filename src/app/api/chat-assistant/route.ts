import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { hybridSearch } from '@/lib/embeddings';
import { supabaseAdmin } from '@/lib/supabase';

// ============================================================
// Chat Assistant API - Multi-turn conversational AI
// POST /api/chat-assistant
// ============================================================

// --- Request Validation Schema ---

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

// --- Initialize OpenAI/OpenRouter Client ---

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
});

const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

// --- System Prompt ---

const SYSTEM_PROMPT = `You are Rememora Assistant, a conversational helper designed to assist users in exploring and understanding their WhatsApp history.

Your capabilities include:
- Answering questions about conversations and messages
- Helping users find specific messages or topics
- Recalling past conversations and identifying patterns
- Providing insights about communication trends and habits
- Summarizing discussions or threads

Guidelines:
- Answer based strictly on the provided context from WhatsApp messages
- If context doesn't contain enough information, say so clearly
- When referencing messages, include sender names and approximate dates when available
- Keep responses concise and friendly, using natural conversational language
- Provide citations by mentioning which chat or contact the information came from
- Never fabricate information - only use what's in the provided context
- If asked about messages from a specific chat, use that chat for your search
- Acknowledge when you don't have enough data to answer a question`;

// --- Interface Definitions ---

interface MessageSource {
    chatId: string;
    text: string;
    senderName?: string;
    timestamp?: string;
}

interface ChatAssistantResponse {
    reply: string;
    sources: MessageSource[];
}

// --- Main Handler ---

export const POST = withAuth(async (req: NextRequest, { user }) => {
    const parsed = await parseBody(req, chatAssistantSchema);
    if (!parsed.success) return parsed.response;

    const { messages, chatId } = parsed.data as ChatAssistantInput;

    try {
        // Extract the latest user message
        const userMessages = messages.filter((m) => m.role === 'user');
        if (userMessages.length === 0) {
            return apiError('No user message found in conversation', 400);
        }

        const latestUserMessage = userMessages[userMessages.length - 1].content;

        // Step 1: Run hybrid search to find relevant context
        let searchResults: any[] = [];
        try {
            searchResults = await hybridSearch({
                userId: user.id,
                query: latestUserMessage,
                matchCount: 8,
                chatId: chatId,
            }) || [];
        } catch (searchError) {
            console.error('[Chat Assistant API] Search error (continuing without context):', searchError);
            // Continue without search results rather than failing entirely
        }

        // Step 2: Enrich search results with metadata
        const enrichedSources = await enrichSearchResults(searchResults, user.id);

        // Step 3: Build context string from search results
        const contextParts = enrichedSources.map((source, index) => {
            const parts = [`[${index + 1}]`, source.text];
            if (source.senderName) parts.push(`From: ${source.senderName}`);
            if (source.timestamp) {
                try {
                    const date = new Date(source.timestamp);
                    parts.push(`Date: ${date.toLocaleDateString()}`);
                } catch {
                    // Invalid date, skip
                }
            }
            return parts.join(' | ');
        });

        const context =
            enrichedSources.length > 0
                ? `Relevant context from WhatsApp messages:\n\n${contextParts.join('\n\n')}`
                : 'No relevant messages found in your WhatsApp history.';

        // Step 4: Build conversation history for LLM
        const conversationHistory = messages.map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        }));

        // Add context as a system message right before the final user message
        const llmMessages = [
            {
                role: 'system' as const,
                content: SYSTEM_PROMPT,
            },
            ...conversationHistory.slice(0, -1), // All but the last message
            {
                role: 'user' as const,
                content: `${context}\n\n---\n\nUser query: ${latestUserMessage}\n\nBased on the context above, please provide a helpful response. Reference specific messages by their number [1], [2], etc. when relevant.`,
            },
        ];

        // Step 5: Call LLM
        const completion = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: llmMessages as any,
            temperature: 0.7,
            max_tokens: 1024,
            top_p: 0.95,
        });

        const reply = completion.choices[0]?.message?.content || 'I was unable to generate a response. Please try again.';

        // Step 6: Format sources for response
        const sources: MessageSource[] = enrichedSources.map((source) => ({
            chatId: source.chatId,
            text: source.text.substring(0, 300), // Truncate for response
            senderName: source.senderName,
            timestamp: source.timestamp,
        }));

        const response: ChatAssistantResponse = {
            reply,
            sources,
        };

        return apiSuccess(response);
    } catch (error) {
        console.error('[Chat Assistant API] Error:', error);

        // Check for specific OpenAI errors
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

// --- Helper: Enrich search results with metadata ---

async function enrichSearchResults(results: any[], userId: string) {
    if (results.length === 0) return [];

    const messageIds = results
        .filter((r) => r.message_id)
        .map((r) => r.message_id);
    const chatIds = [...new Set(results.map((r) => r.chat_id))];

    // Fetch message metadata
    let messageMap = new Map<string, any>();
    if (messageIds.length > 0) {
        const { data: messages } = await supabaseAdmin
            .from('messages')
            .select('id, sender_name, sender_phone, timestamp, chat_id')
            .in('id', messageIds);

        messageMap = new Map((messages || []).map((m) => [m.id, m]));
    }

    // Fetch chat metadata
    let chatMap = new Map<string, any>();
    if (chatIds.length > 0) {
        const { data: chats } = await supabaseAdmin
            .from('chats')
            .select('id, title')
            .in('id', chatIds);

        chatMap = new Map((chats || []).map((c) => [c.id, c]));
    }

    // Enrich results
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
