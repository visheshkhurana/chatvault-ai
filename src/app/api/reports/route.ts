import { NextRequest } from 'next/server';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

// ============================================================
// Reports API - Generate PDF-style report data
// POST /api/reports
// ============================================================

const reportSchema = z.object({
  type: z.enum(['analytics', 'chat_summary', 'contact', 'full']),
  chatId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  period: z.enum(['7d', '30d', '90d']).default('30d'),
  format: z.enum(['json', 'html']).default('json'),
});

type ReportRequest = z.infer<typeof reportSchema>;

interface ReportSection {
  title: string;
  type: 'stats' | 'table' | 'chart' | 'text' | 'list';
  data: any;
}

interface Report {
  title: string;
  generatedAt: string;
  period: string;
  sections: ReportSection[];
}

interface ReportResponse {
  report: Report;
  html?: string;
}

// ============================================================
// Helper Functions
// ============================================================

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

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getPeriodLabel(period: string): string {
  switch (period) {
    case '7d':
      return 'Last 7 Days';
    case '90d':
      return 'Last 90 Days';
    case '30d':
    default:
      return 'Last 30 Days';
  }
}

// ============================================================
// Analytics Report Generator
// ============================================================

async function generateAnalyticsReport(
  userId: string,
  period: string,
  chatId?: string
): Promise<ReportSection[]> {
  const { startDate, endDate } = getDateRange(period);

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

  const { data: messages, error } = await query;

  if (error || !messages || messages.length === 0) {
    return [
      {
        title: 'Analytics Summary',
        type: 'stats',
        data: {
          totalMessages: 0,
          avgMessagesPerDay: 0,
          messageTypeBreakdown: [],
        },
      },
    ];
  }

  // Calculate statistics
  const totalMessages = messages.length;
  const daysSpan = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const avgMessagesPerDay = (totalMessages / daysSpan).toFixed(1);

  // Message type breakdown
  const typeMap = new Map<string, number>();
  messages.forEach((msg: any) => {
    const type = msg.message_type || 'text';
    typeMap.set(type, (typeMap.get(type) || 0) + 1);
  });

  const messageTypeBreakdown = Array.from(typeMap.entries())
    .map(([type, count]) => ({
      type,
      count,
      percentage: ((count / totalMessages) * 100).toFixed(1),
    }))
    .sort((a, b) => b.count - a.count);

  // Top contacts
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
    .slice(0, 5);

  // Hourly distribution
  const hourlyMap = new Map<number, number>();
  for (let i = 0; i < 24; i++) {
    hourlyMap.set(i, 0);
  }

  messages.forEach((msg: any) => {
    const hour = new Date(msg.created_at).getHours();
    hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
  });

  const hourlyDistribution = Array.from(hourlyMap.entries())
    .map(([hour, count]) => ({
      hour: `${hour}:00`,
      count,
    }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

  // Message volume trend
  const volumeMap = new Map<string, number>();
  messages.forEach((msg: any) => {
    const date = new Date(msg.created_at).toISOString().split('T')[0];
    volumeMap.set(date, (volumeMap.get(date) || 0) + 1);
  });

  const messageVolume = Array.from(volumeMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return [
    {
      title: 'Overview',
      type: 'stats',
      data: {
        totalMessages,
        avgMessagesPerDay: parseFloat(avgMessagesPerDay),
        periodDays: daysSpan,
        totalContacts: contactMap.size,
      },
    },
    {
      title: 'Message Types',
      type: 'table',
      data: messageTypeBreakdown,
    },
    {
      title: 'Hourly Activity',
      type: 'chart',
      data: {
        type: 'bar',
        labels: hourlyDistribution.map((d) => d.hour),
        datasets: [
          {
            label: 'Messages',
            data: hourlyDistribution.map((d) => d.count),
          },
        ],
      },
    },
    {
      title: 'Daily Message Volume',
      type: 'chart',
      data: {
        type: 'line',
        labels: messageVolume.map((d) => d.date),
        datasets: [
          {
            label: 'Messages',
            data: messageVolume.map((d) => d.count),
          },
        ],
      },
    },
    {
      title: 'Top 5 Contacts',
      type: 'list',
      data: topContacts,
    },
  ];
}

// ============================================================
// Chat Summary Report Generator
// ============================================================

async function generateChatSummaryReport(
  userId: string,
  chatId: string,
  period: string
): Promise<ReportSection[]> {
  // Fetch chat info
  const { data: chat, error: chatError } = await supabaseAdmin
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .eq('user_id', userId)
    .single();

  if (chatError || !chat) {
    return [
      {
        title: 'Chat Not Found',
        type: 'text',
        data: { message: 'The specified chat could not be found.' },
      },
    ];
  }

  // Fetch messages for this chat
  const { startDate, endDate } = getDateRange(period);
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at', { ascending: true });

  const messageCount = messages?.length || 0;

  // Fetch latest chat summary if available
  const { data: summaries } = await supabaseAdmin
    .from('chat_summaries')
    .select('*')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  const summary = summaries?.[0] || null;

  // Calculate message stats
  const incomingMessages = messages?.filter((m: any) => !m.is_from_me).length || 0;
  const outgoingMessages = messages?.filter((m: any) => m.is_from_me).length || 0;

  // Extract message types
  const typeMap = new Map<string, number>();
  messages?.forEach((msg: any) => {
    const type = msg.message_type || 'text';
    typeMap.set(type, (typeMap.get(type) || 0) + 1);
  });

  const messageTypes = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return [
    {
      title: 'Chat Information',
      type: 'stats',
      data: {
        title: chat.title,
        type: chat.chat_type,
        category: chat.category,
        participantCount: chat.participant_count,
        createdAt: chat.created_at,
      },
    },
    {
      title: 'Message Statistics',
      type: 'stats',
      data: {
        totalMessages: messageCount,
        incomingMessages,
        outgoingMessages,
        dateRange: {
          from: formatDate(startDate),
          to: formatDate(endDate),
        },
      },
    },
    {
      title: 'Message Types',
      type: 'table',
      data: messageTypes,
    },
    ...(summary
      ? [
          {
            title: 'Summary',
            type: 'text' as const,
            data: {
              text: summary.summary_text,
              generatedAt: summary.created_at,
            },
          },
          {
            title: 'Key Topics',
            type: 'list' as const,
            data: summary.key_topics || [],
          },
          {
            title: 'Action Items',
            type: 'list' as const,
            data: summary.action_items || [],
          },
        ]
      : []),
  ];
}

// ============================================================
// Contact Report Generator
// ============================================================

async function generateContactReport(
  userId: string,
  contactId: string
): Promise<ReportSection[]> {
  // Fetch contact info
  const { data: contact, error: contactError } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('user_id', userId)
    .single();

  if (contactError || !contact) {
    return [
      {
        title: 'Contact Not Found',
        type: 'text',
        data: { message: 'The specified contact could not be found.' },
      },
    ];
  }

  // Fetch messages with this contact
  const { data: messages } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('contact_id', contactId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const messageCount = messages?.length || 0;
  const incomingMessages = messages?.filter((m: any) => !m.is_from_me).length || 0;
  const outgoingMessages = messages?.filter((m: any) => m.is_from_me).length || 0;

  // Calculate daily message average
  let avgMessagesPerDay = 0;
  if (messages && messages.length > 0) {
    const firstMsg = new Date(messages[0].created_at);
    const lastMsg = new Date(messages[messages.length - 1].created_at);
    const daysSpan = Math.ceil(
      (lastMsg.getTime() - firstMsg.getTime()) / (1000 * 60 * 60 * 24)
    );
    avgMessagesPerDay = daysSpan > 0 ? messageCount / daysSpan : 0;
  }

  // Response time calculation
  const responseTimes: number[] = [];
  if (messages) {
    for (let i = 0; i < messages.length - 1; i++) {
      const current = messages[i];
      const next = messages[i + 1];

      if (!current.is_from_me && next.is_from_me) {
        const currentTime = new Date(current.created_at).getTime();
        const nextTime = new Date(next.created_at).getTime();
        const diffMinutes = (nextTime - currentTime) / (1000 * 60);

        if (diffMinutes > 0 && diffMinutes <= 1440) {
          responseTimes.push(diffMinutes);
        }
      }
    }
  }

  let avgResponseTime = 0;
  if (responseTimes.length > 0) {
    avgResponseTime =
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  // Message types
  const typeMap = new Map<string, number>();
  messages?.forEach((msg: any) => {
    const type = msg.message_type || 'text';
    typeMap.set(type, (typeMap.get(type) || 0) + 1);
  });

  const messageTypes = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Activity by hour
  const hourlyMap = new Map<number, number>();
  for (let i = 0; i < 24; i++) {
    hourlyMap.set(i, 0);
  }

  messages?.forEach((msg: any) => {
    const hour = new Date(msg.created_at).getHours();
    hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
  });

  const hourlyDistribution = Array.from(hourlyMap.entries())
    .map(([hour, count]) => ({ hour: `${hour}:00`, count }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));

  return [
    {
      title: 'Contact Information',
      type: 'stats',
      data: {
        name: contact.display_name || 'Unknown',
        waId: contact.wa_id,
        tags: contact.tags || [],
        joinedAt: contact.created_at,
      },
    },
    {
      title: 'Communication Statistics',
      type: 'stats',
      data: {
        totalMessages: messageCount,
        incomingMessages,
        outgoingMessages,
        avgMessagesPerDay: parseFloat(avgMessagesPerDay.toFixed(2)),
        avgResponseTime: parseFloat(avgResponseTime.toFixed(1)),
      },
    },
    {
      title: 'Message Types',
      type: 'table',
      data: messageTypes,
    },
    {
      title: 'Activity by Hour',
      type: 'chart',
      data: {
        type: 'bar',
        labels: hourlyDistribution.map((d) => d.hour),
        datasets: [
          {
            label: 'Messages',
            data: hourlyDistribution.map((d) => d.count),
          },
        ],
      },
    },
  ];
}

// ============================================================
// HTML Report Generator
// ============================================================

function generateReportHTML(report: Report): string {
  const currentDate = new Date(report.generatedAt);
  const formattedDate = currentDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const sectionsHTML = report.sections
    .map((section) => generateSectionHTML(section))
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      color: #333;
      background: #f5f5f5;
      line-height: 1.6;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 0 20px rgba(0,0,0,0.1);
    }

    header {
      border-bottom: 3px solid #007bff;
      margin-bottom: 40px;
      padding-bottom: 20px;
    }

    h1 {
      font-size: 32px;
      margin-bottom: 10px;
      color: #1a1a1a;
    }

    .report-meta {
      color: #666;
      font-size: 14px;
    }

    .section {
      margin-bottom: 40px;
      page-break-inside: avoid;
    }

    h2 {
      font-size: 22px;
      margin-bottom: 15px;
      color: #222;
      border-left: 4px solid #007bff;
      padding-left: 15px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }

    .stat-card {
      background: #f8f9fa;
      border-left: 4px solid #007bff;
      padding: 15px;
      border-radius: 4px;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #007bff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }

    th {
      background: #f8f9fa;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #dee2e6;
      color: #495057;
    }

    td {
      padding: 12px;
      border-bottom: 1px solid #dee2e6;
    }

    tr:nth-child(even) {
      background: #f8f9fa;
    }

    .chart-container {
      margin: 20px 0;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 4px;
      text-align: center;
      color: #666;
      font-size: 12px;
    }

    .list-item {
      padding: 10px 0;
      border-bottom: 1px solid #eee;
      display: flex;
      align-items: center;
    }

    .list-item:before {
      content: '→';
      color: #007bff;
      margin-right: 10px;
      font-weight: bold;
    }

    .list-item:last-child {
      border-bottom: none;
    }

    .text-content {
      padding: 20px;
      background: #f8f9fa;
      border-radius: 4px;
      line-height: 1.8;
      color: #555;
    }

    footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
      color: #999;
      font-size: 12px;
    }

    @media print {
      body {
        background: white;
      }
      .container {
        box-shadow: none;
        padding: 20px;
      }
      .section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${report.title}</h1>
      <div class="report-meta">
        <div>Generated: ${formattedDate}</div>
        <div>Period: ${report.period}</div>
      </div>
    </header>

    <main>
      ${sectionsHTML}
    </main>

    <footer>
      <p>Rememora Report • Confidential</p>
    </footer>
  </div>
</body>
</html>
  `;
}

function generateSectionHTML(section: ReportSection): string {
  let contentHTML = '';

  switch (section.type) {
    case 'stats':
      contentHTML = generateStatsHTML(section.data);
      break;
    case 'table':
      contentHTML = generateTableHTML(section.data);
      break;
    case 'chart':
      contentHTML = generateChartPlaceholderHTML(section.data);
      break;
    case 'text':
      contentHTML = generateTextHTML(section.data);
      break;
    case 'list':
      contentHTML = generateListHTML(section.data);
      break;
  }

  return `
    <div class="section">
      <h2>${section.title}</h2>
      ${contentHTML}
    </div>
  `;
}

function generateStatsHTML(data: any): string {
  const entries = Object.entries(data).map(([key, value]) => {
    let displayValue = value;
    if (typeof value === 'number') {
      displayValue = Number.isInteger(value) ? value : parseFloat(value.toString()).toFixed(2);
    } else if (typeof value === 'object') {
      displayValue = JSON.stringify(value);
    }
    return `
      <div class="stat-card">
        <div class="stat-label">${key.replace(/([A-Z])/g, ' $1').toLowerCase()}</div>
        <div class="stat-value">${displayValue}</div>
      </div>
    `;
  });

  return `<div class="stats-grid">${entries.join('')}</div>`;
}

function generateTableHTML(data: any[]): string {
  if (!data || data.length === 0) {
    return '<p>No data available</p>';
  }

  const headers = Object.keys(data[0]);
  const headerHTML = headers.map((h) => `<th>${h}</th>`).join('');
  const rowsHTML = data
    .map(
      (row) =>
        `<tr>${headers.map((h) => `<td>${row[h]}</td>`).join('')}</tr>`
    )
    .join('');

  return `
    <table>
      <thead>
        <tr>${headerHTML}</tr>
      </thead>
      <tbody>
        ${rowsHTML}
      </tbody>
    </table>
  `;
}

function generateChartPlaceholderHTML(data: any): string {
  const labels = data.labels || [];
  const dataPoints = data.datasets?.[0]?.data || [];
  const maxValue = Math.max(...dataPoints);
  const scale = 100 / maxValue;

  if (data.type === 'bar') {
    const bars = labels
      .map(
        (label: string, i: number) =>
          `<div style="margin-bottom: 15px;">
        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">${label}</div>
        <div style="background: #e9ecef; height: 20px; border-radius: 3px; overflow: hidden;">
          <div style="background: #007bff; height: 100%; width: ${(dataPoints[i] * scale).toFixed(0)}%; transition: width 0.3s;"></div>
        </div>
        <div style="font-size: 11px; color: #999;">${dataPoints[i]}</div>
      </div>`
      )
      .join('');
    return `<div class="chart-container">${bars}</div>`;
  } else {
    return `<div class="chart-container">
      <svg style="max-width: 100%; height: 200px;" viewBox="0 0 ${Math.min(labels.length * 40, 600)} 200">
        ${labels
          .map(
            (label: string, i: number) =>
              `<rect x="${i * (600 / labels.length)}" y="${200 - (dataPoints[i] * scale) / 5}" width="${Math.max(600 / labels.length - 5, 10)}" height="${(dataPoints[i] * scale) / 5}" fill="#007bff" />`
          )
          .join('')}
      </svg>
      <div style="margin-top: 10px; font-size: 11px; color: #999;">Chart data (${data.type}): ${JSON.stringify(dataPoints)}</div>
    </div>`;
  }
}

function generateTextHTML(data: any): string {
  return `<div class="text-content">${data.text || data.message || ''}</div>`;
}

function generateListHTML(data: any[]): string {
  if (!data || data.length === 0) {
    return '<p>No items</p>';
  }

  const items = data
    .map((item) => {
      const content = typeof item === 'string' ? item : JSON.stringify(item);
      return `<div class="list-item">${content}</div>`;
    })
    .join('');

  return items;
}

// ============================================================
// Main POST Handler
// ============================================================

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const parsed = await parseBody(req, reportSchema);
    if (!parsed.success) return parsed.response;

    const { type, chatId, contactId, period, format } = parsed.data as ReportRequest;

    const periodLabel = getPeriodLabel(period);
    let sections: ReportSection[] = [];
    let title = 'Report';

    // Generate report sections based on type
    if (type === 'analytics' || type === 'full') {
      title = 'Analytics Report';
      sections = await generateAnalyticsReport(user.id, period, chatId);
    }

    if (type === 'chat_summary' || type === 'full') {
      if (!chatId) {
        return apiError('chatId is required for chat_summary and full reports', 400);
      }
      title = type === 'full' ? 'Comprehensive Report' : 'Chat Summary Report';
      const chatSections = await generateChatSummaryReport(user.id, chatId, period);
      sections = type === 'full' ? [...sections, ...chatSections] : chatSections;
    }

    if (type === 'contact') {
      if (!contactId) {
        return apiError('contactId is required for contact reports', 400);
      }
      title = 'Contact Report';
      sections = await generateContactReport(user.id, contactId);
    }

    const report: Report = {
      title,
      generatedAt: new Date().toISOString(),
      period: periodLabel,
      sections,
    };

    const response: ReportResponse = { report };

    // Generate HTML if requested
    if (format === 'html') {
      response.html = generateReportHTML(report);
    }

    return apiSuccess(response);
  } catch (error) {
    console.error('Reports API error:', error);
    return apiError('Failed to generate report', 500);
  }
});
