import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError, parseBody } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import OpenAI from 'openai';
import { z } from 'zod';

// ============================================================
// Sentiment Analysis API - Analyze mood/sentiment in chats
// GET /api/sentiment?chatId=xxx&period=7d|30d|90d
// POST /api/sentiment/analyze
// ============================================================

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
});

const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

// --- Validation Schema ---
const sentimentAnalyzeSchema = z.object({
    chatId: z.string().min(1),
    period: z.enum(['7d', '30d', '90d']).optional().default('30d'),
});

type SentimentAnalyzeInput = z.infer<typeof sentimentAnalyzeSchema>;

// --- Helper: Get date range from period string ---
function getDateRange(period: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
        case '7d':
            startDate.setDate(startDate.getDate() - 7);
            break;
        case '90d':
            startDate.setDate(startDate.getDate() - 90);
            break;
        case '30d':
        default:
            startDate.setDate(startDate.getDate() - 30);
    }

    return { startDate, endDate };
}

// --- Helper: Format date as YYYY-MM-DD ---
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

// --- Helper: Get date from timestamp ---
function getDateFromTimestamp(timestamp: string): string {
    return new Date(timestamp).toISOString().split('T')[0];
}

// --- Helper: Batch messages for LLM analysis ---
function batchMessages(messages: any[], batchSize: number = 50): string[] {
    const batches: string[] = [];

    for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        const batchText = batch
            .map((msg) => {
                const sender = msg.is_from_me ? 'Me' : 'Them';
                const text = msg.text || '[Media/Attachment]';
                const date = new Date(msg.created_at).toLocaleDateString();
                return `[${date}] ${sender}: ${text}`;
            })
            .join('\n');
        batches.push(batchText);
    }

    return batches;
}

// --- Helper: Analyze sentiment using LLM ---
async function analyzeSentimentWithLLM(
    messageText: string,
    allMessages: any[]
): Promise<{
    overallSentiment: 'positive' | 'neutral' | 'negative';
    score: number;
    moodTimeline: Array<{ date: string; sentiment: 'positive' | 'neutral' | 'negative'; score: number }>;
    topics: Array<{ topic: string; sentiment: 'positive' | 'neutral' | 'negative' }>;
    highlights: { mostPositive: string; mostNegative: string };
}> {
    const prompt = `Analyze the mood and sentiment of the following WhatsApp conversation. Return a JSON object with this structure:
{
  "overallSentiment": "positive" | "neutral" | "negative",
  "score": number between -1 (very negative) and 1 (very positive),
  "moodTimeline": [
    {
      "date": "YYYY-MM-DD",
      "sentiment": "positive" | "neutral" | "negative",
      "score": number between -1 and 1
    }
  ],
  "topics": [
    {
      "topic": "topic name",
      "sentiment": "positive" | "neutral" | "negative"
    }
  ],
  "highlights": {
    "mostPositive": "the most positive message or statement",
    "mostNegative": "the most negative message or statement"
  }
}

Instructions:
1. Analyze the overall emotional tone of the conversation.
2. Identify emotional patterns across days and create a timeline of mood changes.
3. Identify key topics discussed and their associated sentiment.
4. Find the most positive and most negative statements in the conversation.
5. Consider context, emoji usage, language intensity, and conversation flow.
6. Be nuanced - "neutral" doesn't mean absence of emotion, it means balanced or mixed sentiment.

Conversation:
${messageText}`;

    try {
        const response = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
            max_tokens: 2000,
        });

        const content = response.choices[0].message.content;
        if (!content) {
            throw new Error('No response from LLM');
        }

        const analysis = JSON.parse(content);

        // Validate and clean the response
        return {
            overallSentiment: (
                ['positive', 'neutral', 'negative'].includes(analysis.overallSentiment)
                    ? analysis.overallSentiment
                    : 'neutral'
            ) as 'positive' | 'neutral' | 'negative',
            score: typeof analysis.score === 'number' ? Math.max(-1, Math.min(1, analysis.score)) : 0,
            moodTimeline: (analysis.moodTimeline || []).map((item: any) => ({
                date: item.date || '',
                sentiment: (['positive', 'neutral', 'negative'].includes(item.sentiment)
                    ? item.sentiment
                    : 'neutral') as 'positive' | 'neutral' | 'negative',
                score: typeof item.score === 'number' ? Math.max(-1, Math.min(1, item.score)) : 0,
            })),
            topics: (analysis.topics || []).map((item: any) => ({
                topic: item.topic || '',
                sentiment: (['positive', 'neutral', 'negative'].includes(item.sentiment)
                    ? item.sentiment
                    : 'neutral') as 'positive' | 'neutral' | 'negative',
            })),
            highlights: {
                mostPositive: analysis.highlights?.mostPositive || 'N/A',
                mostNegative: analysis.highlights?.mostNegative || 'N/A',
            },
        };
    } catch (error) {
        console.error('LLM sentiment analysis error:', error);
        // Return safe defaults on error
        return {
            overallSentiment: 'neutral',
            score: 0,
            moodTimeline: [],
            topics: [],
            highlights: { mostPositive: 'N/A', mostNegative: 'N/A' },
        };
    }
}

// --- Main Sentiment Analysis Logic ---
async function performSentimentAnalysis(
    userId: string,
    chatId: string,
    period: string
): Promise<{
    chatId: string;
    period: string;
    overallSentiment: 'positive' | 'neutral' | 'negative';
    score: number;
    moodTimeline: Array<{ date: string; sentiment: 'positive' | 'neutral' | 'negative'; score: number }>;
    topics: Array<{ topic: string; sentiment: 'positive' | 'neutral' | 'negative' }>;
    highlights: { mostPositive: string; mostNegative: string };
}> {
    const { startDate, endDate } = getDateRange(period);

    // Fetch messages for the chat
    const { data: messages, error: messagesError } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('user_id', userId)
        .eq('chat_id', chatId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: true });

    if (messagesError) {
        throw messagesError;
    }

    if (!messages || messages.length === 0) {
        return {
            chatId,
            period,
            overallSentiment: 'neutral',
            score: 0,
            moodTimeline: [],
            topics: [],
            highlights: { mostPositive: 'No messages found', mostNegative: 'No messages found' },
        };
    }

    // Batch messages for analysis
    const batches = batchMessages(messages, 50);
    const allBatches = batches.join('\n\n--- Next Batch ---\n\n');

    // Analyze with LLM
    const analysis = await analyzeSentimentWithLLM(allBatches, messages);

    // Sort mood timeline by date
    const sortedTimeline = analysis.moodTimeline.sort((a, b) => a.date.localeCompare(b.date));

    return {
        chatId,
        period,
        overallSentiment: analysis.overallSentiment,
        score: analysis.score,
        moodTimeline: sortedTimeline,
        topics: analysis.topics,
        highlights: analysis.highlights,
    };
}

// ============================================================
// GET Handler - Fetch and analyze sentiment for a chat
// ============================================================
export const GET = withAuth(async (req: NextRequest, { user }) => {
    try {
        const url = new URL(req.url);
        const chatId = url.searchParams.get('chatId');
        const period = (url.searchParams.get('period') || '30d') as '7d' | '30d' | '90d';

        if (!chatId) {
            return apiError('chatId is required', 400);
        }

        const result = await performSentimentAnalysis(user.id, chatId, period);

        return apiSuccess(result);
    } catch (error) {
        console.error('Sentiment GET API error:', error);
        return apiError('Failed to analyze sentiment', 500);
    }
});

// ============================================================
// POST Handler - Accept request body and analyze sentiment
// ============================================================
export const POST = withAuth(async (req: NextRequest, { user }) => {
    try {
        const parsed = await parseBody(req, sentimentAnalyzeSchema);
        if (!parsed.success) return parsed.response;

        const { chatId, period } = parsed.data as SentimentAnalyzeInput;

        const result = await performSentimentAnalysis(user.id, chatId, period);

        // Optionally store the result (for future reference/caching)
        // You could add a sentiment_analyses table to store these
        // await supabaseAdmin.from('sentiment_analyses').insert({
        //     user_id: user.id,
        //     chat_id: chatId,
        //     period,
        //     analysis: result,
        //     created_at: new Date().toISOString(),
        // });

        return apiSuccess(result);
    } catch (error) {
        console.error('Sentiment POST API error:', error);
        return apiError('Failed to analyze sentiment', 500);
    }
});
