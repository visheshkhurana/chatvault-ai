import OpenAI from 'openai';
import { supabaseAdmin } from './supabase';
import { searchEmbeddings, hybridSearch } from './embeddings';

// ============================================================
// RAG (Retrieval-Augmented Generation) Engine
// ============================================================

const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
});

const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

// --- Types ---

export interface RAGQuery {
    userId: string;
    query: string;
    chatId?: string;
    dateFrom?: string;
    dateTo?: string;
    maxResults?: number;
    includeAttachments?: boolean;
}

export interface RAGResponse {
    answer: string;
    citations: Array<{
      messageId: string | null;
      chatId: string;
      text: string;
      similarity: number;
      timestamp?: string;
      senderName?: string;
    }>;
    relatedAttachments: Array<{
      id: string;
      fileName: string;
      fileType: string;
      storageUrl: string;
    }>;
}

// --- System Prompt ---

const SYSTEM_PROMPT = `You are ChatVault AI, a search and recall utility for WhatsApp messages and documents.
Your job is to answer questions using ONLY the provided context from the user's WhatsApp conversations.

Rules:
- Answer based strictly on the provided context. Do not make up information.
- If the context does not contain enough information to answer, say so clearly.
- When referencing specific messages, include the sender name and approximate date.
- Keep answers concise and focused. Use bullet points for multiple items.
- When asked about documents or attachments, describe their content based on extracted text.
- Provide citations by mentioning which chat or contact the information came from.
- Never fabricate quotes or attribute statements to people without evidence in the context.`;

// --- Query the RAG Pipeline ---

export async function queryRAG(params: RAGQuery): Promise<RAGResponse> {
    const {
          userId,
          query,
          chatId,
          dateFrom,
          dateTo,
          maxResults = 8,
          includeAttachments = true,
    } = params;

  // Step 1: Retrieve relevant chunks via hybrid search
  const searchResults = await hybridSearch({
        userId,
        query,
        matchCount: maxResults,
        chatId,
        dateFrom,
        dateTo,
  });

  if (searchResults.length === 0) {
        return {
                answer: 'I could not find any relevant messages or documents matching your query. Try rephrasing or broadening your search.',
                citations: [],
                relatedAttachments: [],
        };
  }

  // Step 2: Enrich results with message/attachment details
  const enrichedResults = await enrichSearchResults(searchResults, userId);

  // Step 3: Build context for the LLM
  const contextParts = enrichedResults.map((r: any, i: number) => {
        const parts = [`[${i + 1}]`];
        if (r.senderName) parts.push(`From: ${r.senderName}`);
        if (r.chatTitle) parts.push(`Chat: ${r.chatTitle}`);
        if (r.timestamp) parts.push(`Date: ${new Date(r.timestamp).toLocaleDateString()}`);
        if (r.fileName) parts.push(`File: ${r.fileName}`);
        parts.push(`\n${r.chunk_text}`);
        return parts.join(' | ');
  });

  const context = contextParts.join('\n\n---\n\n');

  // Step 4: Call the LLM
  const completion = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
                    role: 'user',
                    content: `Context from WhatsApp messages:\n\n${context}\n\n---\n\nUser query: ${query}\n\nProvide a concise, accurate answer based on the context above. Reference specific messages by their number [1], [2], etc.`,
          },
              ],
        temperature: 0.3,
        max_tokens: 1024,
  });

  const answer = completion.choices[0]?.message?.content || 'Unable to generate a response.';

  // Step 5: Get related attachments
  let relatedAttachments: any[] = [];
    if (includeAttachments) {
          const attachmentIds = enrichedResults
            .filter((r: any) => r.attachmentId)
            .map((r: any) => r.attachmentId);

      if (attachmentIds.length > 0) {
              const { data } = await supabaseAdmin
                .from('attachments')
                .select('id, file_name, file_type, storage_url')
                .in('id', attachmentIds);
              relatedAttachments = (data || []).map((a: any) => ({
                        id: a.id,
                        fileName: a.file_name,
                        fileType: a.file_type,
                        storageUrl: a.storage_url,
              }));
      }
    }

  // Step 6: Build citations
  const citations = enrichedResults.map((r: any) => ({
        messageId: r.messageId,
        chatId: r.chatId,
        text: r.chunk_text.substring(0, 200),
        similarity: r.similarity || r.combined_score || 0,
        timestamp: r.timestamp,
        senderName: r.senderName,
  }));

  return { answer, citations, relatedAttachments };
}

// --- Enrich search results with metadata ---

async function enrichSearchResults(results: any[], userId: string) {
    const messageIds = results.filter((r: any) => r.message_id).map((r: any) => r.message_id);
    const chatIds = [...new Set(results.map((r: any) => r.chat_id))];

  // Fetch messages
  const { data: messages } = messageIds.length > 0
      ? await supabaseAdmin
            .from('messages')
            .select('id, sender_name, sender_phone, timestamp, chat_id')
            .in('id', messageIds)
        : { data: [] };

  // Fetch chats
  const { data: chats } = await supabaseAdmin
      .from('chats')
      .select('id, title')
      .in('id', chatIds);

  const messageMap = new Map<string, any>((messages || []).map((m: any) => [m.id, m]));
    const chatMap = new Map<string, any>((chats || []).map((c: any) => [c.id, c]));

  return results.map((r: any) => {
        const message = messageMap.get(r.message_id);
        const chat = chatMap.get(r.chat_id);
        return {
                ...r,
                senderName: message?.sender_name || r.metadata?.sender_name,
                timestamp: message?.timestamp || r.metadata?.timestamp,
                chatTitle: chat?.title || 'Unknown Chat',
                messageId: r.message_id,
                attachmentId: r.attachment_id,
                chatId: r.chat_id,
                fileName: r.metadata?.file_name,
        };
  });
}

// --- Generate Chat Summary ---

export async function generateChatSummary(params: {
    userId: string;
    chatId: string;
    dateFrom: string;
    dateTo: string;
}): Promise<{ summary: string; actionItems: string[]; keyTopics: string[] }> {
    const { userId, chatId, dateFrom, dateTo } = params;

  // Fetch messages for the period
  const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('text_content, sender_name, timestamp, message_type')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .gte('timestamp', dateFrom)
      .lte('timestamp', dateTo)
      .order('timestamp', { ascending: true })
      .limit(500);

  if (!messages || messages.length === 0) {
        return { summary: 'No messages found in this period.', actionItems: [], keyTopics: [] };
  }

  // Format messages for LLM
  const formattedMessages = messages
      .filter((m: any) => m.text_content)
      .map((m: any) => `[${new Date(m.timestamp).toLocaleString()}] ${m.sender_name || 'Unknown'}: ${m.text_content}`)
      .join('\n');

  const completion = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: [
          {
                    role: 'system',
                    content: `You are a summarization tool. Summarize the following WhatsApp conversation.
                    Provide:
                    1. A concise summary (2-3 paragraphs max)
                    2. Key topics discussed (comma-separated list)
                    3. Action items or pending tasks (if any)

                    Format your response as JSON:
                    {"summary": "...", "keyTopics": ["topic1", "topic2"], "actionItems": ["item1", "item2"]}`,
          },
          { role: 'user', content: formattedMessages },
              ],
        temperature: 0.3,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
  });

  try {
        const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
        return {
                summary: result.summary || 'Summary generation failed.',
                actionItems: result.actionItems || [],
                keyTopics: result.keyTopics || [],
        };
  } catch {
        return {
                summary: completion.choices[0]?.message?.content || 'Summary generation failed.',
                actionItems: [],
                keyTopics: [],
        };
  }
}
