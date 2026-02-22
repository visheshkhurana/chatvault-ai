import OpenAI from 'openai';
import { supabaseAdmin } from './supabase';

// ============================================================
// Embedding Generation & Chunking
// ============================================================

// Use OpenRouter for embeddings (or direct OpenAI)
const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY!,
    baseURL: 'https://openrouter.ai/api/v1',
});

const EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small';
const CHUNK_SIZE = 800;        // tokens per chunk
const CHUNK_OVERLAP = 100;     // overlap between chunks
const CHARS_PER_TOKEN = 4;     // approximate

// --- Text Chunking ---

export function chunkText(
    text: string,
    maxChunkSize: number = CHUNK_SIZE,
    overlap: number = CHUNK_OVERLAP
  ): string[] {
    if (!text || text.trim().length === 0) return [];

  const maxChars = maxChunkSize * CHARS_PER_TOKEN;
    const overlapChars = overlap * CHARS_PER_TOKEN;

  // Split by paragraphs first, then by sentences
  const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let currentChunk = '';

  for (const paragraph of paragraphs) {
        if ((currentChunk + '\n\n' + paragraph).length > maxChars && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                // Keep overlap from the end of the previous chunk
          const overlapText = currentChunk.slice(-overlapChars);
                currentChunk = overlapText + '\n\n' + paragraph;
        } else {
                currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
        }
  }

  if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
  }

  // If any chunk is still too large, split by sentences
  const finalChunks: string[] = [];
    for (const chunk of chunks) {
          if (chunk.length > maxChars) {
                  const sentences = chunk.match(/[^.!?]+[.!?]+/g) || [chunk];
                  let subChunk = '';
                  for (const sentence of sentences) {
                            if ((subChunk + ' ' + sentence).length > maxChars && subChunk.length > 0) {
                                        finalChunks.push(subChunk.trim());
                                        subChunk = sentence;
                            } else {
                                        subChunk = subChunk ? subChunk + ' ' + sentence : sentence;
                            }
                  }
                  if (subChunk.trim().length > 0) {
                            finalChunks.push(subChunk.trim());
                  }
          } else {
                  finalChunks.push(chunk);
          }
    }

  return finalChunks;
}

// --- Generate Embedding ---

export async function generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: text.replace(/\n/g, ' ').trim(),
    });
    return response.data[0].embedding;
}

// --- Generate Embeddings in Batch ---

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const cleanTexts = texts.map((t: any) => t.replace(/\n/g, ' ').trim());
    const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: cleanTexts,
    });
    return response.data.map((d: any) => d.embedding);
}

// --- Store Embeddings ---

export async function storeEmbeddings(params: {
    userId: string;
    messageId?: string;
    attachmentId?: string;
    chatId: string;
    text: string;
    metadata: Record<string, any>;
}): Promise<void> {
    const { userId, messageId, attachmentId, chatId, text, metadata } = params;

  const chunks = chunkText(text);
    if (chunks.length === 0) return;

  const embeddings = await generateEmbeddingsBatch(chunks);

  const rows = chunks.map((chunk, index) => ({
        user_id: userId,
        message_id: messageId || null,
        attachment_id: attachmentId || null,
        chat_id: chatId,
        chunk_index: index,
        chunk_text: chunk,
        embedding: JSON.stringify(embeddings[index]),
        token_count: Math.ceil(chunk.length / CHARS_PER_TOKEN),
        metadata: {
                ...metadata,
                chunk_index: index,
                total_chunks: chunks.length,
        },
  }));

  const { error } = await supabaseAdmin.from('embeddings').insert(rows);
    if (error) {
          console.error('Error storing embeddings:', error);
          throw error;
    }
}

// --- Search Embeddings ---

export async function searchEmbeddings(params: {
    userId: string;
    query: string;
    matchCount?: number;
    matchThreshold?: number;
    chatId?: string;
    dateFrom?: string;
    dateTo?: string;
}): Promise<any[]> {
    const {
          userId,
          query,
          matchCount = 10,
          matchThreshold = 0.7,
          chatId,
          dateFrom,
          dateTo,
    } = params;

  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabaseAdmin.rpc('search_embeddings', {
        p_user_id: userId,
        p_query_embedding: JSON.stringify(queryEmbedding),
        p_match_count: matchCount,
        p_match_threshold: matchThreshold,
        p_chat_id: chatId || null,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
  });

  if (error) {
        console.error('Error searching embeddings:', error);
        throw error;
  }

  return data || [];
}

// --- Hybrid Search ---

export async function hybridSearch(params: {
    userId: string;
    query: string;
    matchCount?: number;
    chatId?: string;
    dateFrom?: string;
    dateTo?: string;
    vectorWeight?: number;
    textWeight?: number;
}): Promise<any[]> {
    const {
        userId,
        query,
        matchCount = 10,
        chatId,
        dateFrom,
        dateTo,
        vectorWeight = 0.7,
        textWeight = 0.3,
    } = params;

  const queryEmbedding = await generateEmbedding(query);

  const { data, error } = await supabaseAdmin.rpc('hybrid_search', {
        p_user_id: userId,
        p_query_embedding: JSON.stringify(queryEmbedding),
        p_query_text: query,
        p_match_count: matchCount,
        p_vector_weight: vectorWeight,
        p_text_weight: textWeight,
        p_chat_id: chatId || null,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
  });

  if (error) {
        console.error('Error in hybrid search:', error);
        throw error;
  }

  return data || [];
}
