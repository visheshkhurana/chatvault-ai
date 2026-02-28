/**
 * Emotional Intelligence Module
 * Analyzes sentiment, emotions, and communication health
 * Tracks emotional patterns and generates insights
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

export type Emotion =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'anxious'
  | 'neutral'
  | 'excited'
  | 'frustrated'
  | 'confused'
  | 'grateful';

export interface EmotionAnalysis {
  emotion: Emotion;
  sentiment_score: number; // -1 to 1
  confidence: number; // 0 to 1
  emotion_distribution?: Record<Emotion, number>;
}

export interface ConversationHealth {
  communication_health_rating: number; // 0-100
  tone_indicators: {
    is_positive: boolean;
    is_supportive: boolean;
    is_responsive: boolean;
    is_respectful: boolean;
  };
  dominant_emotion: Emotion;
  average_sentiment: number;
  message_count_analyzed: number;
  period: string;
}

export interface EmotionalAnalysisRecord {
  id?: string;
  user_id: string;
  contact_phone: string;
  period_type: 'daily' | 'weekly' | 'monthly';
  period_start: string;
  period_end: string;
  message_count: number;
  average_sentiment: number;
  dominant_emotion: Emotion;
  emotional_intensity: number; // 0-1
  tone_summary: string;
  health_rating: number; // 0-100
  insights: string[];
  created_at?: string;
}

// ============================================================
// Analysis Prompts
// ============================================================

const EMOTION_ANALYSIS_PROMPT = `You are an emotion detection system. Analyze the provided text and determine the primary emotion and sentiment.

EMOTIONS TO CLASSIFY:
- happy: Content, pleased, joyful
- sad: Unhappy, disappointed, down
- angry: Frustrated, annoyed, upset
- anxious: Worried, concerned, stressed
- neutral: Objective, matter-of-fact
- excited: Enthusiastic, energetic
- frustrated: Annoyed with difficulties
- confused: Uncertain, puzzled
- grateful: Thankful, appreciative

RESPONSE FORMAT (strict JSON):
{
  "emotion": "emotion_name",
  "sentiment_score": -0.5,
  "confidence": 0.85,
  "emotion_distribution": {"happy": 0.1, "sad": 0.05, ...}
}`;

const CONVERSATION_HEALTH_PROMPT = `Analyze this conversation for communication health. Evaluate tone, responsiveness, respect, and support.

RESPONSE FORMAT (strict JSON):
{
  "health_rating": 75,
  "tone_indicators": {
    "is_positive": true,
    "is_supportive": true,
    "is_responsive": true,
    "is_respectful": true
  },
  "dominant_emotion": "happy",
  "average_sentiment": 0.6,
  "summary": "Brief assessment of conversation health"
}`;

// ============================================================
// Analysis Functions
// ============================================================

/**
 * Analyze emotion and sentiment of a message
 * @param text Input text to analyze
 * @returns Emotion analysis with sentiment score
 */
export async function analyzeMessageEmotion(text: string): Promise<EmotionAnalysis> {
  try {
    if (!text || text.trim().length === 0) {
      return {
        emotion: 'neutral',
        sentiment_score: 0,
        confidence: 0,
      };
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: EMOTION_ANALYSIS_PROMPT,
        },
        {
          role: 'user',
          content: `Analyze this text:\n\n"${text}"`,
        },
      ],
      temperature: 0.3,
    });

    try {
      const result = JSON.parse(response.choices[0].message.content || '{}');
      return {
        emotion: result.emotion || 'neutral',
        sentiment_score: Math.max(-1, Math.min(1, result.sentiment_score || 0)),
        confidence: Math.max(0, Math.min(1, result.confidence || 0)),
        emotion_distribution: result.emotion_distribution,
      };
    } catch {
      return {
        emotion: 'neutral',
        sentiment_score: 0,
        confidence: 0,
      };
    }
  } catch (error) {
    console.error('Error analyzing message emotion:', error);
    return {
      emotion: 'neutral',
      sentiment_score: 0,
      confidence: 0,
    };
  }
}

/**
 * Analyze conversation health for a chat
 * @param userId User ID
 * @param chatId Chat ID
 * @returns Conversation health assessment
 */
export async function analyzeConversationHealth(
  userId: string,
  chatId: string
): Promise<ConversationHealth> {
  try {
    // Fetch recent messages
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .order('timestamp', { ascending: false })
      .limit(50);

    if (messagesError || !messages || messages.length === 0) {
      return {
        communication_health_rating: 50,
        tone_indicators: {
          is_positive: false,
          is_supportive: false,
          is_responsive: false,
          is_respectful: true,
        },
        dominant_emotion: 'neutral',
        average_sentiment: 0,
        message_count_analyzed: 0,
        period: 'recent',
      };
    }

    // Analyze emotions
    const emotions: EmotionAnalysis[] = [];
    let totalSentiment = 0;

    for (const msg of messages) {
      if (msg.text_content) {
        const emotion = await analyzeMessageEmotion(msg.text_content);
        emotions.push(emotion);
        totalSentiment += emotion.sentiment_score;
      }
    }

    const averageSentiment = emotions.length > 0 ? totalSentiment / emotions.length : 0;

    // Count emotion frequencies
    const emotionCounts: Record<Emotion, number> = {
      happy: 0,
      sad: 0,
      angry: 0,
      anxious: 0,
      neutral: 0,
      excited: 0,
      frustrated: 0,
      confused: 0,
      grateful: 0,
    };

    emotions.forEach((e) => {
      emotionCounts[e.emotion]++;
    });

    const dominantEmotion = (Object.keys(emotionCounts) as Emotion[]).reduce((a, b) =>
      emotionCounts[a] > emotionCounts[b] ? a : b
    );

    // Analyze tone
    const conversationText = messages
      .filter((m) => m.text_content)
      .map((m) => m.text_content)
      .join(' ');

    let healthRating = 50;
    let toneIndicators = {
      is_positive: averageSentiment > 0.3,
      is_supportive: conversationText.toLowerCase().includes('help') ||
                      conversationText.toLowerCase().includes('support') ||
                      conversationText.toLowerCase().includes('great'),
      is_responsive: messages.length >= 10,
      is_respectful: !conversationText.toLowerCase().match(/rude|disrespect|bad|hate/),
    };

    // Calculate health rating
    healthRating = 30; // base
    if (toneIndicators.is_positive) healthRating += 20;
    if (toneIndicators.is_supportive) healthRating += 15;
    if (toneIndicators.is_responsive) healthRating += 15;
    if (toneIndicators.is_respectful) healthRating += 20;

    return {
      communication_health_rating: healthRating,
      tone_indicators: toneIndicators,
      dominant_emotion: dominantEmotion,
      average_sentiment: Math.round(averageSentiment * 100) / 100,
      message_count_analyzed: emotions.length,
      period: 'recent_50_messages',
    };
  } catch (error) {
    console.error('Error analyzing conversation health:', error);
    return {
      communication_health_rating: 50,
      tone_indicators: {
        is_positive: false,
        is_supportive: false,
        is_responsive: false,
        is_respectful: true,
      },
      dominant_emotion: 'neutral',
      average_sentiment: 0,
      message_count_analyzed: 0,
      period: 'error',
    };
  }
}

/**
 * Generate emotional analysis report for a contact
 * @param userId User ID
 * @param contactPhone Contact phone number
 * @param periodType Time period for analysis
 * @returns Emotional analysis report
 */
export async function generateEmotionalReport(
  userId: string,
  contactPhone: string,
  periodType: 'daily' | 'weekly' | 'monthly' = 'weekly'
): Promise<EmotionalAnalysisRecord> {
  try {
    // Calculate date range based on period type
    const now = new Date();
    let periodStart = new Date();

    if (periodType === 'daily') {
      periodStart.setDate(now.getDate() - 1);
    } else if (periodType === 'weekly') {
      periodStart.setDate(now.getDate() - 7);
    } else if (periodType === 'monthly') {
      periodStart.setMonth(now.getMonth() - 1);
    }

    // Fetch messages for period
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .eq('sender_phone', contactPhone)
      .gte('timestamp', periodStart.toISOString())
      .lte('timestamp', now.toISOString())
      .order('timestamp', { ascending: true });

    if (messagesError || !messages) {
      throw messagesError;
    }

    // Analyze emotions
    const emotions: EmotionAnalysis[] = [];
    let totalSentiment = 0;

    for (const msg of messages) {
      if (msg.text_content) {
        const emotion = await analyzeMessageEmotion(msg.text_content);
        emotions.push(emotion);
        totalSentiment += emotion.sentiment_score;
      }
    }

    // Calculate metrics
    const averageSentiment = emotions.length > 0 ? totalSentiment / emotions.length : 0;
    const emotionCounts: Record<Emotion, number> = {
      happy: 0,
      sad: 0,
      angry: 0,
      anxious: 0,
      neutral: 0,
      excited: 0,
      frustrated: 0,
      confused: 0,
      grateful: 0,
    };

    emotions.forEach((e) => {
      emotionCounts[e.emotion]++;
    });

    const dominantEmotion = (Object.keys(emotionCounts) as Emotion[]).reduce((a, b) =>
      emotionCounts[a] > emotionCounts[b] ? a : b
    );

    // Calculate emotional intensity
    const emotionalIntensity = emotions.length > 0
      ? emotions.reduce((sum, e) => sum + Math.abs(e.sentiment_score), 0) / emotions.length
      : 0;

    // Generate health rating
    const healthRating = Math.max(0, Math.min(100, 50 + averageSentiment * 50));

    // Generate insights
    const insights: string[] = [];
    if (averageSentiment > 0.5) {
      insights.push('Predominantly positive conversation tone');
    } else if (averageSentiment < -0.3) {
      insights.push('Conversation has negative sentiment');
    }
    if (emotionCounts.grateful > emotions.length * 0.2) {
      insights.push('High gratitude expressed');
    }
    if (emotionCounts.anxious > emotions.length * 0.2) {
      insights.push('Conversation includes concerns or anxiety');
    }

    // Create and store report
    const report: EmotionalAnalysisRecord = {
      user_id: userId,
      contact_phone: contactPhone,
      period_type: periodType,
      period_start: periodStart.toISOString(),
      period_end: now.toISOString(),
      message_count: messages.length,
      average_sentiment: Math.round(averageSentiment * 100) / 100,
      dominant_emotion: dominantEmotion,
      emotional_intensity: Math.round(emotionalIntensity * 100) / 100,
      tone_summary: `${dominantEmotion} tone with ${averageSentiment > 0 ? 'positive' : 'neutral/negative'} sentiment`,
      health_rating: Math.round(healthRating),
      insights,
    };

    // Upsert into database
    const { error: upsertError } = await supabaseAdmin
      .from('emotional_analysis')
      .upsert(
        {
          ...report,
          created_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,contact_phone,period_type',
        }
      );

    if (upsertError) {
      console.error('Error storing emotional analysis:', upsertError);
    }

    return report;
  } catch (error) {
    console.error('Error generating emotional report:', error);
    throw error;
  }
}
