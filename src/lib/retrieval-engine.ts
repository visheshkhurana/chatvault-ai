/**
 * Smart Document Retrieval Engine
 * Wraps existing RAG pipeline with entity-aware search,
 * file delivery via WhatsApp, and confidence-based clarification.
 */

import OpenAI from 'openai';
import { hybridSearch } from './embeddings';
import { getSignedDownloadUrl } from './storage';
import {
  sendTextMessage,
  sendDocumentByUrl,
  sendImageByUrl,
} from './whatsapp';
import type { ClassifiedIntent } from './intent-classifier';

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
});

// ============================================================
// Types
// ============================================================

interface RetrievalResult {
  answer: string;
  files: Array<{
    id: string;
    fileName: string;
    fileType: string;
    storageUrl: string;
    storageKey: string;
    mimeType: string;
  }>;
  citations: Array<{
    text: string;
    senderName?: string;
    timestamp?: string;
    chatTitle?: string;
  }>;
  confidence: number;
  clarificationNeeded: boolean;
  clarificationQuestion?: string;
}

// ============================================================
// Main Retrieval Handler
// ============================================================

export async function handleRetrieval(
  supabaseAdmin: any,
  userId: string,
  senderPhone: string,
  classified: ClassifiedIntent
): Promise<void> {
  try {
    await sendTextMessage(senderPhone, '🔍 Searching your memory...');

    const result = await smartRetrieve(supabaseAdmin, userId, classified);

    if (result.clarificationNeeded && result.clarificationQuestion) {
      await sendTextMessage(senderPhone, result.clarificationQuestion);
      return;
    }

    // Send text answer
    await sendTextMessage(senderPhone, result.answer);

    // Send files if found
    for (const file of result.files.slice(0, 5)) {
      try {
        const signedUrl = await getSignedDownloadUrl(file.storageKey, 3600);

        if (file.fileType === 'image') {
          await sendImageByUrl(senderPhone, signedUrl, `📎 ${file.fileName}`);
        } else {
          await sendDocumentByUrl(
            senderPhone,
            signedUrl,
            file.fileName,
            `📎 ${file.fileName}`
          );
        }
      } catch (fileErr) {
        console.error(`[Retrieval] Failed to send file ${file.fileName}:`, fileErr);
      }
    }
  } catch (error) {
    console.error('[Retrieval] Error:', error);
    await sendTextMessage(
      senderPhone,
      '❌ Sorry, I had trouble searching. Please try rephrasing your request.'
    );
  }
}

// ============================================================
// Smart Retrieve — Entity-Aware Search
// ============================================================

async function smartRetrieve(
  supabaseAdmin: any,
  userId: string,
  classified: ClassifiedIntent
): Promise<RetrievalResult> {
  const { entities, suggestedQuery, originalMessage } = classified;

  // ---- Step 1: Build search filters from entities ----

  let chatIdFilter: string | undefined;
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  const maxResults = entities.quantities[0] || 5;

  // If person mentioned, try to find their contact and filter by their chats
  if (entities.contactReferences.length > 0 || entities.people.length > 0) {
    const personName = entities.contactReferences[0] || entities.people[0];
    const { data: contacts } = await supabaseAdmin
      .from('contacts')
      .select('id, wa_id, display_name')
      .eq('user_id', userId)
      .ilike('display_name', `%${personName}%`)
      .limit(1);

    if (contacts && contacts.length > 0) {
      // Find chat with this contact
      const { data: chats } = await supabaseAdmin
        .from('chats')
        .select('id')
        .eq('user_id', userId)
        .eq('wa_chat_id', contacts[0].wa_id)
        .limit(1);

      if (chats && chats.length > 0) {
        chatIdFilter = chats[0].id;
      }
    }
  }

  // Parse date filters from entities
  if (entities.dates.length > 0) {
    const dateInfo = parseDateFilter(entities.dates[0]);
    if (dateInfo) {
      dateFrom = dateInfo.from;
      dateTo = dateInfo.to;
    }
  }

  // ---- Step 2: Hybrid search ----

  const searchQuery = suggestedQuery || originalMessage;
  const searchResults = await hybridSearch({
    userId,
    query: searchQuery,
    matchCount: Math.max(maxResults * 2, 10), // Fetch extra for re-ranking
    chatId: chatIdFilter,
    dateFrom,
    dateTo,
  });

  // ---- Step 3: Find related attachments ----

  const attachments = await findRelatedAttachments(
    supabaseAdmin,
    userId,
    searchResults,
    entities,
    maxResults
  );

  // ---- Step 4: Enrich results with metadata ----

  const enrichedResults = await enrichResults(supabaseAdmin, searchResults);

  // ---- Step 5: Generate answer via LLM ----

  if (enrichedResults.length === 0 && attachments.length === 0) {
    return {
      answer: `🔍 I couldn't find anything matching "${originalMessage}". Try:\n• Different keywords\n• A broader time range\n• Checking if the content was shared via WhatsApp`,
      files: [],
      citations: [],
      confidence: 0,
      clarificationNeeded: false,
    };
  }

  const contextStr = enrichedResults
    .slice(0, 8)
    .map((r, i) => {
      const meta = [];
      if (r.senderName) meta.push(`From: ${r.senderName}`);
      if (r.chatTitle) meta.push(`Chat: ${r.chatTitle}`);
      if (r.timestamp) meta.push(`Date: ${r.timestamp}`);
      return `[${i + 1}] ${meta.join(' | ')}\n${r.text}`;
    })
    .join('\n\n');

  const fileList = attachments.length > 0
    ? `\n\nFound files:\n${attachments.map(a => `• ${a.fileName} (${a.fileType})`).join('\n')}`
    : '';

  const llmResponse = await openai.chat.completions.create({
    model: process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct',
    messages: [
      {
        role: 'system',
        content: `You are Rememora, a WhatsApp AI assistant that helps users find their stored information.
You have search results from the user's message history and files.
Answer concisely for WhatsApp (max 300 words). Use the context provided.
If attaching files, mention them briefly.
Never fabricate information not in the context.
If results don't fully match the request, say so honestly.
Format for WhatsApp: use *bold*, _italic_, and line breaks.`,
      },
      {
        role: 'user',
        content: `User asked: "${originalMessage}"

Search results:
${contextStr}
${fileList}

Provide a helpful WhatsApp response.`,
      },
    ],
    temperature: 0.3,
    max_tokens: 512,
  });

  const answer = llmResponse.choices[0]?.message?.content || 'I found some results but had trouble summarizing them.';

  // Determine confidence
  const avgSimilarity = enrichedResults.length > 0
    ? enrichedResults.reduce((sum, r) => sum + (r.similarity || 0), 0) / enrichedResults.length
    : 0;

  const needsClarification = avgSimilarity < 0.3 && attachments.length === 0;

  return {
    answer: needsClarification
      ? `🤔 I'm not very confident in these results. ${answer}\n\nCould you be more specific? For example:\n• Who sent it?\n• Approximate date?\n• What type of file?`
      : answer,
    files: attachments,
    citations: enrichedResults.slice(0, 3).map(r => ({
      text: r.text.substring(0, 150),
      senderName: r.senderName,
      timestamp: r.timestamp,
      chatTitle: r.chatTitle,
    })),
    confidence: avgSimilarity,
    clarificationNeeded: needsClarification,
    clarificationQuestion: needsClarification
      ? 'Could you provide more details about what you\'re looking for?'
      : undefined,
  };
}

// ============================================================
// Find Related Attachments
// ============================================================

async function findRelatedAttachments(
  supabaseAdmin: any,
  userId: string,
  searchResults: any[],
  entities: ClassifiedIntent['entities'],
  maxResults: number
) {
  const attachments: any[] = [];

  // Strategy 1: Get attachments linked to search result messages
  const messageIds = searchResults
    .filter(r => r.message_id)
    .map(r => r.message_id)
    .filter((id, i, arr) => arr.indexOf(id) === i);

  if (messageIds.length > 0) {
    const { data: linkedAttachments } = await supabaseAdmin
      .from('attachments')
      .select('id, file_name, file_type, storage_url, storage_key, mime_type')
      .eq('user_id', userId)
      .in('message_id', messageIds.slice(0, 20))
      .limit(maxResults);

    if (linkedAttachments) {
      attachments.push(...linkedAttachments.map((a: any) => ({
        id: a.id,
        fileName: a.file_name || 'Unknown file',
        fileType: a.file_type,
        storageUrl: a.storage_url,
        storageKey: a.storage_key,
        mimeType: a.mime_type || 'application/octet-stream',
      })));
    }
  }

  // Strategy 2: Search attachments by document type keywords
  if (entities.documentTypes.length > 0 && attachments.length < maxResults) {
    const typeKeywords = entities.documentTypes.join(' ');
    const { data: typeAttachments } = await supabaseAdmin
      .from('attachments')
      .select('id, file_name, file_type, storage_url, storage_key, mime_type, created_at')
      .eq('user_id', userId)
      .or(
        entities.documentTypes
          .map(dt => `file_name.ilike.%${dt}%,ocr_text.ilike.%${dt}%,pdf_text.ilike.%${dt}%`)
          .join(',')
      )
      .order('created_at', { ascending: false })
      .limit(maxResults);

    if (typeAttachments) {
      const existingIds = new Set(attachments.map(a => a.id));
      for (const a of typeAttachments) {
        if (!existingIds.has(a.id)) {
          attachments.push({
            id: a.id,
            fileName: a.file_name || 'Unknown file',
            fileType: a.file_type,
            storageUrl: a.storage_url,
            storageKey: a.storage_key,
            mimeType: a.mime_type || 'application/octet-stream',
          });
        }
      }
    }
  }

  // Strategy 3: Search by file type if specified
  if (entities.fileTypes.length > 0 && attachments.length < maxResults) {
    const fileTypeMap: Record<string, string[]> = {
      'pdf': ['document'],
      'photo': ['image'],
      'image': ['image'],
      'video': ['video'],
      'audio': ['audio'],
      'voice': ['voice', 'audio'],
      'doc': ['document'],
      'excel': ['document'],
    };
    const dbTypes = entities.fileTypes.flatMap(ft => fileTypeMap[ft.toLowerCase()] || [ft]);

    if (dbTypes.length > 0) {
      const { data: typeFilteredAttachments } = await supabaseAdmin
        .from('attachments')
        .select('id, file_name, file_type, storage_url, storage_key, mime_type, created_at')
        .eq('user_id', userId)
        .in('file_type', dbTypes)
        .order('created_at', { ascending: false })
        .limit(maxResults);

      if (typeFilteredAttachments) {
        const existingIds = new Set(attachments.map(a => a.id));
        for (const a of typeFilteredAttachments) {
          if (!existingIds.has(a.id)) {
            attachments.push({
              id: a.id,
              fileName: a.file_name || 'Unknown file',
              fileType: a.file_type,
              storageUrl: a.storage_url,
              storageKey: a.storage_key,
              mimeType: a.mime_type || 'application/octet-stream',
            });
          }
        }
      }
    }
  }

  return attachments.slice(0, maxResults);
}

// ============================================================
// Enrich Results with Metadata
// ============================================================

async function enrichResults(supabaseAdmin: any, searchResults: any[]) {
  return searchResults.map(r => ({
    text: r.chunk_text || r.text || '',
    similarity: r.combined_score || r.similarity || 0,
    messageId: r.message_id,
    chatId: r.chat_id,
    senderName: r.metadata?.sender_name || r.sender_name,
    timestamp: r.metadata?.timestamp || r.timestamp,
    chatTitle: r.metadata?.chat_title || r.chat_title,
  }));
}

// ============================================================
// Date Filter Parser
// ============================================================

function parseDateFilter(dateStr: string): { from?: string; to?: string } | null {
  const now = new Date();
  const lower = dateStr.toLowerCase().trim();

  if (lower === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString() };
  }

  if (lower === 'yesterday') {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  const lastNMatch = lower.match(/last\s+(\d+)\s+(day|week|month)s?/);
  if (lastNMatch) {
    const n = parseInt(lastNMatch[1]);
    const unit = lastNMatch[2];
    const start = new Date(now);
    if (unit === 'day') start.setDate(start.getDate() - n);
    else if (unit === 'week') start.setDate(start.getDate() - n * 7);
    else if (unit === 'month') start.setMonth(start.getMonth() - n);
    return { from: start.toISOString(), to: now.toISOString() };
  }

  if (lower.includes('this week')) {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString() };
  }

  if (lower.includes('this month')) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start.toISOString(), to: now.toISOString() };
  }

  return null;
}
