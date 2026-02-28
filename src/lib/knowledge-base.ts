/**
 * Knowledge Base Module
 * Extracts and organizes personal knowledge from messages
 * Supports recipes, recommendations, addresses, tips, and other extractable content
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

export type KnowledgeCategory =
  | 'recipe'
  | 'recommendation'
  | 'address'
  | 'tip'
  | 'contact_info'
  | 'instruction'
  | 'idea'
  | 'resource'
  | 'other';

export interface KnowledgeEntry {
  id?: string;
  user_id: string;
  chat_id: string;
  message_id: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  tags: string[];
  source_sender?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExtractionResult {
  extractable: boolean;
  category?: KnowledgeCategory;
  title?: string;
  content?: string;
  tags?: string[];
  confidence?: number;
  reasoning?: string;
}

// ============================================================
// Extraction Prompt
// ============================================================

const EXTRACTION_PROMPT = `You are an intelligent knowledge extraction system for personal conversations.
Analyze the provided message and determine if it contains extractable knowledge that should be saved for future reference.

KNOWLEDGE TYPES TO EXTRACT:
- recipe: Cooking recipes, meal preparation, ingredient lists, cooking instructions
- recommendation: Product recommendations, restaurant reviews, book suggestions, service recommendations
- address: Physical locations, business addresses, meeting places, travel destinations
- tip: Life hacks, productivity tips, health advice, learning tips
- contact_info: Phone numbers, email addresses, social media handles, business contacts
- instruction: How-to guides, tutorials, step-by-step instructions
- idea: Business ideas, project ideas, creative concepts
- resource: Links to tools, websites, databases, educational resources
- other: Any other useful information worth keeping

DECISION RULES:
- Extract if the message contains specific, actionable information (not just opinions or casual chat)
- Extract if the information would be useful to save for future reference
- Don't extract vague statements or general conversation
- Look for context about WHO shared this (if mentioned)

RESPONSE FORMAT (strict JSON):
{
  "extractable": true/false,
  "category": "recipe|recommendation|address|tip|contact_info|instruction|idea|resource|other",
  "title": "Brief, descriptive title",
  "content": "Full extractable content",
  "tags": ["tag1", "tag2", "tag3"],
  "confidence": 0.0-1.0,
  "reasoning": "Why this should/shouldn't be extracted"
}`;

// ============================================================
// Extraction Functions
// ============================================================

/**
 * Extract knowledge from a message using LLM analysis
 * @param params Message parameters for extraction
 * @returns Extracted knowledge entry or null
 */
export async function extractKnowledgeFromMessage(params: {
  userId: string;
  messageId: string;
  chatId: string;
  text: string;
  senderName?: string;
}): Promise<KnowledgeEntry | null> {
  const { userId, messageId, chatId, text, senderName } = params;

  try {
    if (!text || text.trim().length < 20) {
      return null; // Skip very short messages
    }

    // Analyze with LLM
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: EXTRACTION_PROMPT,
        },
        {
          role: 'user',
          content: `Analyze this message:\n\n"${text}"${senderName ? `\n\nFrom: ${senderName}` : ''}`,
        },
      ],
      temperature: 0.3,
    });

    let extractionData: ExtractionResult;
    try {
      extractionData = JSON.parse(
        response.choices[0].message.content || '{}'
      );
    } catch {
      return null;
    }

    // Skip if not extractable or confidence is too low
    if (!extractionData.extractable || (extractionData.confidence || 0) < 0.6) {
      return null;
    }

    // Create knowledge entry
    const entry: KnowledgeEntry = {
      user_id: userId,
      chat_id: chatId,
      message_id: messageId,
      category: extractionData.category || 'other',
      title: extractionData.title || text.substring(0, 100),
      content: extractionData.content || text,
      tags: extractionData.tags || [],
      source_sender: senderName,
    };

    // Store in database
    const { error: insertError, data } = await supabaseAdmin
      .from('knowledge_entries')
      .insert(entry)
      .select()
      .single();

    if (insertError) {
      console.error('Error storing knowledge entry:', insertError);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error extracting knowledge:', error);
    return null;
  }
}

/**
 * Search knowledge entries by text content
 * @param userId User ID
 * @param query Search query
 * @param limit Maximum results
 * @returns Matching knowledge entries
 */
export async function searchKnowledge(
  userId: string,
  query: string,
  limit: number = 10
): Promise<KnowledgeEntry[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_entries')
      .select('*')
      .eq('user_id', userId)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%,tags.cs.{"${query}"}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error searching knowledge:', error);
    return [];
  }
}

/**
 * Get knowledge entries by category
 * @param userId User ID
 * @param category Knowledge category
 * @param limit Maximum results
 * @returns Knowledge entries in category
 */
export async function getKnowledgeByCategory(
  userId: string,
  category: KnowledgeCategory,
  limit: number = 20
): Promise<KnowledgeEntry[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('category', category)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching knowledge by category:', error);
    return [];
  }
}

/**
 * Get all knowledge categories with entry counts
 * @param userId User ID
 * @returns Object mapping categories to counts
 */
export async function getKnowledgeSummary(userId: string): Promise<Record<KnowledgeCategory, number>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_entries')
      .select('category')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    const summary: Record<KnowledgeCategory, number> = {
      recipe: 0,
      recommendation: 0,
      address: 0,
      tip: 0,
      contact_info: 0,
      instruction: 0,
      idea: 0,
      resource: 0,
      other: 0,
    };

    (data || []).forEach((entry: any) => {
      if (summary[entry.category as KnowledgeCategory] !== undefined) {
        summary[entry.category as KnowledgeCategory]++;
      }
    });

    return summary;
  } catch (error) {
    console.error('Error fetching knowledge summary:', error);
    return {
      recipe: 0,
      recommendation: 0,
      address: 0,
      tip: 0,
      contact_info: 0,
      instruction: 0,
      idea: 0,
      resource: 0,
      other: 0,
    };
  }
}

/**
 * Get knowledge entries by tag
 * @param userId User ID
 * @param tag Tag to search
 * @param limit Maximum results
 * @returns Knowledge entries with tag
 */
export async function getKnowledgeByTag(
  userId: string,
  tag: string,
  limit: number = 20
): Promise<KnowledgeEntry[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_entries')
      .select('*')
      .eq('user_id', userId)
      .contains('tags', [tag])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching knowledge by tag:', error);
    return [];
  }
}

/**
 * Update a knowledge entry
 * @param entryId Knowledge entry ID
 * @param updates Partial updates
 */
export async function updateKnowledgeEntry(
  entryId: string,
  updates: Partial<KnowledgeEntry>
): Promise<KnowledgeEntry | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('knowledge_entries')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error updating knowledge entry:', error);
    return null;
  }
}

/**
 * Delete a knowledge entry
 * @param entryId Knowledge entry ID
 */
export async function deleteKnowledgeEntry(entryId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('knowledge_entries')
      .delete()
      .eq('id', entryId);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error deleting knowledge entry:', error);
    return false;
  }
}
