/**
 * Relationship Intelligence Module
 * Analyzes communication patterns with contacts
 * Calculates engagement metrics, sentiment trends, and identifies attention-needed contacts
 */

import OpenAI from 'openai';
import { supabaseAdmin } from './supabase';

// ============================================================
// OpenAI Client (via OpenRouter)
// ============================================================

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api/v1',
});

const MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

// ============================================================
// Types
// ============================================================

export interface ContactAnalysis {
  total_messages: number;
  messages_sent: number;
  messages_received: number;
  first_message_at: string;
  last_message_at: string;
  avg_response_time_minutes: number;
  daily_avg_messages: number;
  weekly_trend: 'increasing' | 'decreasing' | 'stable';
  top_topics: string[];
  sentiment_score: number; // -1 to 1
  needs_attention: boolean;
  last_interaction_days: number;
}

export interface ContactInsights {
  user_id: string;
  contact_phone: string;
  contact_name?: string;
  total_messages: number;
  messages_sent: number;
  messages_received: number;
  first_interaction_at: string;
  last_interaction_at: string;
  avg_response_time_minutes: number;
  daily_avg: number;
  weekly_trend: string;
  top_topics: string[];
  sentiment_score: number;
  needs_attention: boolean;
  days_since_last_interaction: number;
  insights_generated_at: string;
}

// ============================================================
// Analysis Functions
// ============================================================

/**
 * Analyze communication patterns with a specific contact
 * @param userId User ID
 * @param contactPhone Contact phone number
 * @returns Contact analysis with metrics
 */
export async function analyzeContact(
  userId: string,
  contactPhone: string
): Promise<ContactAnalysis> {
  try {
    // Fetch all messages with this contact
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .eq('sender_phone', contactPhone)
      .order('timestamp', { ascending: true });

    if (messagesError) {
      throw messagesError;
    }

    if (!messages || messages.length === 0) {
      return {
        total_messages: 0,
        messages_sent: 0,
        messages_received: 0,
        first_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        avg_response_time_minutes: 0,
        daily_avg_messages: 0,
        weekly_trend: 'stable',
        top_topics: [],
        sentiment_score: 0,
        needs_attention: false,
        last_interaction_days: 0,
      };
    }

    // Calculate basic metrics
    const totalMessages = messages.length;
    const messagesSent = messages.filter((m) => m.is_from_me).length;
    const messagesReceived = totalMessages - messagesSent;
    const firstMessageAt = messages[0].timestamp;
    const lastMessageAt = messages[messages.length - 1].timestamp;

    // Calculate days since last interaction
    const lastInteractionDate = new Date(lastMessageAt);
    const daysSinceLastInteraction = Math.floor(
      (Date.now() - lastInteractionDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calculate daily average
    const firstDate = new Date(firstMessageAt);
    const lastDate = new Date(lastMessageAt);
    const daysDiff = Math.max(1, Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
    const dailyAvg = totalMessages / daysDiff;

    // Calculate average response time
    const responseTimes: number[] = [];
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].is_from_me && !messages[i + 1].is_from_me) {
        const timeDiff = new Date(messages[i + 1].timestamp).getTime() - new Date(messages[i].timestamp).getTime();
        responseTimes.push(timeDiff / (1000 * 60)); // Convert to minutes
      }
    }
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Calculate weekly trend (last 30 days vs previous 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const recentMessages = messages.filter(
      (m) => new Date(m.timestamp) > thirtyDaysAgo
    ).length;
    const priorMessages = messages.filter(
      (m) => new Date(m.timestamp) <= thirtyDaysAgo && new Date(m.timestamp) > sixtyDaysAgo
    ).length;

    let weeklyTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentMessages > priorMessages * 1.2) {
      weeklyTrend = 'increasing';
    } else if (recentMessages < priorMessages * 0.8) {
      weeklyTrend = 'decreasing';
    }

    // Extract topics using LLM (recent 50 messages)
    const recentMessageTexts = messages
      .slice(-50)
      .filter((m) => m.text_content)
      .map((m) => m.text_content)
      .join('\n');

    let topTopics: string[] = [];
    let sentimentScore = 0;

    if (recentMessageTexts.trim().length > 0) {
      try {
        const topicsResponse = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            {
              role: 'system',
              content: `You are analyzing conversation topics and sentiment. Extract 3-5 main topics discussed and calculate overall sentiment (-1 to 1, where -1 is very negative, 0 is neutral, 1 is very positive). Return JSON: {"topics": ["topic1", "topic2"], "sentiment": 0.5}`,
            },
            {
              role: 'user',
              content: `Analyze these recent messages:\n\n${recentMessageTexts}`,
            },
          ],
          temperature: 0.3,
        });

        try {
          const result = JSON.parse(
            topicsResponse.choices[0].message.content || '{}'
          );
          topTopics = result.topics || [];
          sentimentScore = result.sentiment || 0;
        } catch {
          // If parsing fails, continue with defaults
        }
      } catch (error) {
        console.error('Error extracting topics:', error);
      }
    }

    // Determine if needs attention
    const needsAttention = daysSinceLastInteraction > 14 && messagesReceived > 0;

    // Upsert into contact_insights table
    await supabaseAdmin
      .from('contact_insights')
      .upsert(
        {
          user_id: userId,
          contact_phone: contactPhone,
          total_messages: totalMessages,
          messages_sent: messagesSent,
          messages_received: messagesReceived,
          first_interaction_at: firstMessageAt,
          last_interaction_at: lastMessageAt,
          avg_response_time_minutes: Math.round(avgResponseTime * 100) / 100,
          daily_avg: Math.round(dailyAvg * 100) / 100,
          weekly_trend: weeklyTrend,
          top_topics: topTopics,
          sentiment_score: Math.round(sentimentScore * 100) / 100,
          needs_attention: needsAttention,
          days_since_last_interaction: daysSinceLastInteraction,
          insights_generated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,contact_phone' }
      );

    return {
      total_messages: totalMessages,
      messages_sent: messagesSent,
      messages_received: messagesReceived,
      first_message_at: firstMessageAt,
      last_message_at: lastMessageAt,
      avg_response_time_minutes: avgResponseTime,
      daily_avg_messages: dailyAvg,
      weekly_trend: weeklyTrend,
      top_topics: topTopics,
      sentiment_score: sentimentScore,
      needs_attention: needsAttention,
      last_interaction_days: daysSinceLastInteraction,
    };
  } catch (error) {
    console.error('Error analyzing contact:', error);
    throw error;
  }
}

/**
 * Get stored contact insights
 * @param userId User ID
 * @param contactPhone Contact phone number
 * @returns Contact insights from database
 */
export async function getContactInsights(
  userId: string,
  contactPhone: string
): Promise<ContactInsights | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('contact_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('contact_phone', contactPhone)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data || null;
  } catch (error) {
    console.error('Error fetching contact insights:', error);
    return null;
  }
}

/**
 * Get all contacts that need attention
 * @param userId User ID
 * @returns Array of contacts needing attention
 */
export async function getAttentionNeededContacts(userId: string): Promise<ContactInsights[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('contact_insights')
      .select('*')
      .eq('user_id', userId)
      .eq('needs_attention', true)
      .order('days_since_last_interaction', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching attention-needed contacts:', error);
    return [];
  }
}

/**
 * Refresh analysis for all contacts of a user
 * @param userId User ID
 */
export async function refreshAllContacts(userId: string): Promise<void> {
  try {
    // Get all distinct contacts
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('sender_phone')
      .eq('user_id', userId)
      .not('sender_phone', 'is', null);

    if (messagesError) {
      throw messagesError;
    }

    if (!messages || messages.length === 0) {
      return;
    }

    // Get unique contacts
    const uniqueContacts = Array.from(new Set(messages.map((m) => m.sender_phone)));

    // Analyze each contact
    for (const contactPhone of uniqueContacts) {
      if (contactPhone) {
        try {
          await analyzeContact(userId, contactPhone);
        } catch (error) {
          console.error(`Error analyzing contact ${contactPhone}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error refreshing all contacts:', error);
    throw error;
  }
}
