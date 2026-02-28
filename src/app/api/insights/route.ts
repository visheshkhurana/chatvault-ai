import { NextRequest } from 'next/server';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
});
const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

type RelationshipInsight = {
    contactId: string;
    contactName: string;
    relationshipScore: number;
    responseTime: {
        avg: string;
        trend: 'improving' | 'declining' | 'stable';
    };
    communicationStyle: {
        initiator: 'you' | 'them' | 'balanced';
        topTopics: string[];
        messageFrequency: string;
    };
    sentiment: {
        overall: string;
        recent: string;
    };
    insights: string[];
    recommendations: string[];
};

type TimelineEvent = {
    date: string;
    type: 'decision' | 'commitment' | 'milestone' | 'topic_shift' | 'conflict' | 'celebration';
    title: string;
    summary: string;
    chatTitle: string;
    participants: string[];
};

type TimelineResponse = {
    timeline: TimelineEvent[];
};

async function fetchContactMessages(userId: string, contactId: string, limit: number = 200) {
    const { data: messages, error } = await supabaseAdmin
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${contactId}),and(sender_id.eq.${contactId},recipient_id.eq.${userId})`)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return messages || [];
}

async function fetchChatMessages(userId: string, chatId: string, limit: number = 200) {
    const { data: chatData, error: chatError } = await supabaseAdmin
        .from('chats')
        .select('id, title, participants')
        .eq('id', chatId)
        .eq('user_id', userId)
        .single();

    if (chatError) throw chatError;

    const { data: messages, error: messagesError } = await supabaseAdmin
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (messagesError) throw messagesError;

    return { chat: chatData, messages: messages || [] };
}

async function analyzeRelationship(
    userId: string,
    contactId: string,
    contactName: string,
    messages: any[]
): Promise<RelationshipInsight> {
    const recentMessages = messages.slice(0, 100).reverse();

    const analysisPrompt = `Analyze the conversation history between two people and provide a comprehensive relationship analysis.

Conversation History:
${recentMessages
    .map(
        (msg) => `
[${new Date(msg.created_at).toLocaleString()}] ${msg.sender_id === userId ? 'You' : contactName}: ${msg.content}
`
    )
    .join('')}

Provide a detailed JSON analysis with the following structure:
{
  "relationshipScore": <number 0-100>,
  "responseTimeAvg": "<string like '2-3 hours' or '1 day'>",
  "responseTimeTrend": "<'improving' | 'declining' | 'stable'>",
  "communicationInitiator": "<'you' | 'them' | 'balanced'>",
  "topTopics": [<array of 3-5 main topics discussed>],
  "messageFrequency": "<'daily' | 'weekly' | 'monthly' or specific pattern>",
  "overallSentiment": "<positive | neutral | mixed | negative with brief description>",
  "recentSentiment": "<positive | neutral | mixed | negative with brief description>",
  "insights": [<array of 5-7 insightful observations about the relationship>],
  "recommendations": [<array of 3-5 suggestions for improving communication>]
}`;

    const response = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: [
            {
                role: 'user',
                content: analysisPrompt,
            },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('No response from LLM');

    const analysis = JSON.parse(content);

    return {
        contactId,
        contactName,
        relationshipScore: analysis.relationshipScore,
        responseTime: {
            avg: analysis.responseTimeAvg,
            trend: analysis.responseTimeTrend,
        },
        communicationStyle: {
            initiator: analysis.communicationInitiator,
            topTopics: analysis.topTopics,
            messageFrequency: analysis.messageFrequency,
        },
        sentiment: {
            overall: analysis.overallSentiment,
            recent: analysis.recentSentiment,
        },
        insights: analysis.insights,
        recommendations: analysis.recommendations,
    };
}

async function analyzeGroupChat(
    userId: string,
    chatData: any,
    messages: any[]
): Promise<any> {
    const recentMessages = messages.slice(0, 300).reverse();

    // Compute stats locally first
    const senderCounts: Record<string, number> = {};
    const senderChars: Record<string, number> = {};
    const hourCounts: number[] = new Array(24).fill(0);
    const dayCounts: Record<string, number> = {};

    for (const msg of recentMessages) {
        const sender = msg.sender_name || msg.sender_id || 'Unknown';
        senderCounts[sender] = (senderCounts[sender] || 0) + 1;
        senderChars[sender] = (senderChars[sender] || 0) + (msg.content?.length || 0);

        const d = new Date(msg.timestamp || msg.created_at);
        hourCounts[d.getHours()]++;
        const dayKey = d.toISOString().split('T')[0];
        dayCounts[dayKey] = (dayCounts[dayKey] || 0) + 1;
    }

    // Top 10 senders by message count
    const topSenders = Object.entries(senderCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({
            name,
            count,
            avgLength: Math.round((senderChars[name] || 0) / count),
            percentage: Math.round((count / recentMessages.length) * 100),
        }));

    // Peak hours
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

    // Ask LLM for topic analysis
    const sampleMessages = recentMessages
        .filter(m => m.content && m.content.length > 10)
        .slice(0, 100);

    const topicPrompt = `Analyze this group chat and identify themes, discussion topics, and group dynamics.

Chat Title: ${chatData.title}
Participants: ${(chatData.participants || []).join(', ')}
Total messages analyzed: ${recentMessages.length}

Sample messages:
${sampleMessages.map(m => `[${m.sender_name || 'Unknown'}]: ${m.content?.slice(0, 200)}`).join('\n')}

Provide JSON:
{
  "topics": [{"topic": "<name>", "frequency": "<high|medium|low>", "description": "<1 sentence>"}],
  "groupDynamics": "<1-2 sentence description of group dynamics>",
  "keyDecisions": ["<recent decisions made in the group>"],
  "actionItems": ["<pending action items or tasks mentioned>"],
  "mood": "<overall group mood: positive, neutral, productive, tense, etc>"
}`;

    const response = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: topicPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1500,
    });

    const content = response.choices[0].message.content;
    const analysis = content ? JSON.parse(content) : {};

    return {
        chatTitle: chatData.title,
        participantCount: (chatData.participants || []).length,
        messagesAnalyzed: recentMessages.length,
        topSenders,
        peakHour,
        activityByHour: hourCounts,
        topics: analysis.topics || [],
        groupDynamics: analysis.groupDynamics || '',
        keyDecisions: analysis.keyDecisions || [],
        actionItems: analysis.actionItems || [],
        mood: analysis.mood || 'neutral',
    };
}

async function analyzeTimeline(
    userId: string,
    chatData: any,
    messages: any[]
): Promise<TimelineResponse> {
    const recentMessages = messages.slice(0, 200).reverse();
    const participants = chatData.participants || [];

    const timelinePrompt = `Analyze the conversation history and extract key events, milestones, and turning points.

Chat Title: ${chatData.title}
Participants: ${participants.join(', ')}

Conversation History:
${recentMessages
    .map(
        (msg) => `
[${new Date(msg.created_at).toISOString()}] ${msg.sender_id}: ${msg.content}
`
    )
    .join('')}

Identify significant events and provide a JSON timeline with the following structure:
{
  "timeline": [
    {
      "date": "<ISO date string>",
      "type": "<'decision' | 'commitment' | 'milestone' | 'topic_shift' | 'conflict' | 'celebration'>",
      "title": "<short title>",
      "summary": "<1-2 sentence description>",
      "chatTitle": "${chatData.title}",
      "participants": ${JSON.stringify(participants)}
    }
  ]
}

Extract 5-10 significant events. Include decisions made, commitments, important dates mentioned, milestones reached, conflicts resolved, topic changes, and celebrations. Sort by date.`;

    const response = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: [
            {
                role: 'user',
                content: timelinePrompt,
            },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error('No response from LLM');

    const timeline = JSON.parse(content);

    // Sort timeline by date
    timeline.timeline.sort(
        (a: TimelineEvent, b: TimelineEvent) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return timeline;
}

export const GET = withAuth(async (request: NextRequest, { user }) => {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action') || 'relationship';

        if (action === 'relationship') {
            const contactId = searchParams.get('contactId');
            if (!contactId) {
                return apiError('contactId is required', 400);
            }

            // Fetch contact details
            const { data: contact, error: contactError } = await supabaseAdmin
                .from('contacts')
                .select('id, name')
                .eq('id', contactId)
                .eq('user_id', user.id)
                .single();

            if (contactError || !contact) {
                return apiError('Contact not found', 404);
            }

            // Fetch messages
            const messages = await fetchContactMessages(user.id, contactId);

            if (messages.length === 0) {
                return apiError('No messages found for this contact', 404);
            }

            // Analyze relationship
            const insight = await analyzeRelationship(
                user.id,
                contactId,
                contact.name,
                messages
            );

            return apiSuccess(insight);
        } else if (action === 'timeline') {
            const chatId = searchParams.get('chatId');
            const period = searchParams.get('period') || 'all';

            if (!chatId) {
                return apiError('chatId is required', 400);
            }

            // Fetch chat and messages
            const { chat, messages } = await fetchChatMessages(user.id, chatId);

            if (!chat) {
                return apiError('Chat not found', 404);
            }

            if (messages.length === 0) {
                return apiError('No messages found for this chat', 404);
            }

            // Filter messages by period if specified
            let filteredMessages = messages;
            if (period !== 'all') {
                const days = parseInt(period);
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - days);

                filteredMessages = messages.filter(
                    (msg) => new Date(msg.created_at) >= cutoffDate
                );
            }

            // Analyze timeline
            const timeline = await analyzeTimeline(user.id, chat, filteredMessages);

            return apiSuccess(timeline);
        } else if (action === 'group') {
            const chatId = searchParams.get('chatId');
            if (!chatId) {
                return apiError('chatId is required', 400);
            }

            const { chat, messages } = await fetchChatMessages(user.id, chatId);
            if (!chat) return apiError('Chat not found', 404);
            if (messages.length === 0) return apiError('No messages found', 404);

            const period = searchParams.get('period') || 'all';
            let filteredMessages = messages;
            if (period !== 'all') {
                const days = parseInt(period);
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - days);
                filteredMessages = messages.filter(
                    (msg) => new Date(msg.created_at) >= cutoffDate
                );
            }

            const groupAnalysis = await analyzeGroupChat(user.id, chat, filteredMessages);
            return apiSuccess(groupAnalysis);
        } else {
            return apiError('Invalid action parameter', 400);
        }
    } catch (error) {
        console.error('Insights API error:', error);
        return apiError(
            error instanceof Error ? error.message : 'Failed to generate insights',
            500
        );
    }
});
