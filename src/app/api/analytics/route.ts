import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, apiSuccess, apiError } from '@/lib/api-utils';

// Helper function to calculate date range
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

// Helper function to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper function to get day of week (0-6, Sunday-Saturday)
function getDayOfWeek(date: Date): number {
  return date.getDay();
}

// Helper function to get hour from timestamp
function getHourFromTimestamp(timestamp: string): number {
  return new Date(timestamp).getHours();
}

// Helper function to get date from timestamp
function getDateFromTimestamp(timestamp: string): string {
  return new Date(timestamp).toISOString().split('T')[0];
}

// Calculate response time between message pairs
function calculateResponseTimes(messages: any[]): number[] {
  const responseTimes: number[] = [];

  for (let i = 0; i < messages.length - 1; i++) {
    const current = messages[i];
    const next = messages[i + 1];

    // Look for pattern: received message (is_from_me=false) followed by sent reply (is_from_me=true)
    if (!current.is_from_me && next.is_from_me) {
      const currentTime = new Date(current.created_at).getTime();
      const nextTime = new Date(next.created_at).getTime();
      const diffMinutes = (nextTime - currentTime) / (1000 * 60);

      // Only count if response is within 24 hours (reasonable threshold)
      if (diffMinutes > 0 && diffMinutes <= 1440) {
        responseTimes.push(diffMinutes);
      }
    }
  }

  return responseTimes;
}

// Calculate statistics for response times
function calculateResponseTimeStats(responseTimes: number[]) {
  if (responseTimes.length === 0) {
    return {
      average: 0,
      median: 0,
      min: 0,
      max: 0,
      count: 0,
    };
  }

  const sorted = [...responseTimes].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const average = sum / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return {
    average: Math.round(average * 100) / 100,
    median: Math.round(median * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    count: sorted.length,
  };
}

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const userId = user.id;
    // Parse query parameters
    const url = new URL(req.url);
    const period = url.searchParams.get('period') || '30d';
    const chatId = url.searchParams.get('chatId');

    const { startDate, endDate } = getDateRange(period);
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    // Build base query
    let query = supabaseAdmin
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true });

    if (chatId) {
      query = query.eq('chat_id', chatId);
    }

    const { data: messages, error: messagesError } = await query;

    if (messagesError) {
      throw messagesError;
    }

    if (!messages || messages.length === 0) {
      return apiSuccess( {
        period,
        startDate: startDateStr,
        endDate: endDateStr,
        messageVolume: [],
        topContacts: [],
        chatActivity: [],
        messageTypeBreakdown: [],
        hourlyDistribution: [],
        responseTimeStats: {
          average: 0,
          median: 0,
          min: 0,
          max: 0,
          count: 0,
        },
        weeklyTrend: [],
        activityHeatmap: [],
      });
    }

    // 1. MESSAGE VOLUME - messages per day
    const volumeMap = new Map<string, number>();
    messages.forEach((msg: any) => {
      const date = getDateFromTimestamp(msg.created_at);
      volumeMap.set(date, (volumeMap.get(date) || 0) + 1);
    });

    const messageVolume = Array.from(volumeMap.entries())
      .map(([date, count]) => ({
        date,
        count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 2. TOP CONTACTS - top 10 by message count
    const contactMap = new Map<string, number>();
    messages.forEach((msg: any) => {
      if (msg.contact_id) {
        contactMap.set(msg.contact_id, (contactMap.get(msg.contact_id) || 0) + 1);
      }
    });

    const topContacts = Array.from(contactMap.entries())
      .map(([contactId, count]) => ({
        contactId,
        messageCount: count,
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    // 3. CHAT ACTIVITY - top 10 most active chats
    const chatMap = new Map<string, number>();
    messages.forEach((msg: any) => {
      chatMap.set(msg.chat_id, (chatMap.get(msg.chat_id) || 0) + 1);
    });

    const chatActivity = Array.from(chatMap.entries())
      .map(([chatIdVal, count]) => ({
        chatId: chatIdVal,
        messageCount: count,
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10);

    // 4. MESSAGE TYPE BREAKDOWN - count by message_type
    const typeMap = new Map<string, number>();
    messages.forEach((msg: any) => {
      const type = msg.message_type || 'text';
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });

    const messageTypeBreakdown = Array.from(typeMap.entries())
      .map(([type, count]) => ({
        type,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // 5. HOURLY DISTRIBUTION - messages per hour (0-23)
    const hourlyMap = new Map<number, number>();
    for (let i = 0; i < 24; i++) {
      hourlyMap.set(i, 0);
    }

    messages.forEach((msg: any) => {
      const hour = getHourFromTimestamp(msg.created_at);
      hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
    });

    const hourlyDistribution = Array.from(hourlyMap.entries())
      .map(([hour, count]) => ({
        hour,
        count,
      }))
      .sort((a, b) => a.hour - b.hour);

    // 6. RESPONSE TIME STATS - calculate from message pairs
    const responseTimeStats = calculateResponseTimeStats(calculateResponseTimes(messages));

    // 7. WEEKLY TREND - messages per week
    const weeklyMap = new Map<number, { week: number; count: number; startDate: string }>();

    messages.forEach((msg: any) => {
      const date = new Date(msg.created_at);
      const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
      const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
      const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);

      if (!weeklyMap.has(weekNumber)) {
        const weekStart = new Date(date.getFullYear(), 0, 1 + (weekNumber - 1) * 7);
        weeklyMap.set(weekNumber, {
          week: weekNumber,
          count: 0,
          startDate: formatDate(weekStart),
        });
      }

      const weekData = weeklyMap.get(weekNumber)!;
      weekData.count += 1;
    });

    const weeklyTrend = Array.from(weeklyMap.values())
      .sort((a, b) => a.week - b.week);

    // 8. ACTIVITY HEATMAP - messages by day_of_week (0-6) and hour (0-23)
    const heatmapMap = new Map<string, number>();

    // Initialize all combinations
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        heatmapMap.set(`${day}-${hour}`, 0);
      }
    }

    messages.forEach((msg: any) => {
      const date = new Date(msg.created_at);
      const day = getDayOfWeek(date);
      const hour = getHourFromTimestamp(msg.created_at);
      const key = `${day}-${hour}`;
      heatmapMap.set(key, (heatmapMap.get(key) || 0) + 1);
    });

    const activityHeatmap = Array.from(heatmapMap.entries())
      .map(([key, count]) => {
        const [day, hour] = key.split('-').map(Number);
        return {
          dayOfWeek: day,
          hour,
          count,
        };
      })
      .sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) {
          return a.dayOfWeek - b.dayOfWeek;
        }
        return a.hour - b.hour;
      });

    return apiSuccess( {
      period,
      startDate: startDateStr,
      endDate: endDateStr,
      totalMessages: messages.length,
      messageVolume,
      topContacts,
      chatActivity,
      messageTypeBreakdown,
      hourlyDistribution,
      responseTimeStats,
      weeklyTrend,
      activityHeatmap,
      metadata: {
        userId,
        chatIdFilter: chatId || null,
      },
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return apiError('Failed to retrieve analytics', 500);
  }
});
