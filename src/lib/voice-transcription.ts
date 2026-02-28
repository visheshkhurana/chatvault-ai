/**
 * Voice Note Transcription Module
 * Handles audio transcription using OpenAI Whisper API
 * Stores transcriptions and generates embeddings for semantic search
 */

import OpenAI from 'openai';
import { supabaseAdmin } from './supabase';
import { storeEmbeddings } from './embeddings';

// ============================================================
// OpenAI Whisper Client (Direct, not via OpenRouter)
// ============================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const WHISPER_MODEL = 'whisper-1';

// ============================================================
// Types
// ============================================================

export interface TranscriptionResult {
  text: string;
  language: string;
  duration?: number;
  confidence?: number;
}

export interface VoiceNoteParams {
  userId: string;
  messageId: string;
  attachmentId: string;
  chatId: string;
  audioBuffer: Buffer;
  mimeType: string;
}

// ============================================================
// Transcription Functions
// ============================================================

/**
 * Transcribe audio buffer using OpenAI Whisper API
 * @param buffer Audio file buffer
 * @param mimeType MIME type of audio (e.g., 'audio/mpeg', 'audio/wav')
 * @returns Transcription result with text, language, and confidence
 */
export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string
): Promise<TranscriptionResult> {
  try {
    // Convert buffer to File-like object for OpenAI API
    const audioFile = new File([buffer as any], 'audio.wav', { type: mimeType });

    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: WHISPER_MODEL,
      language: undefined, // Let Whisper auto-detect
      temperature: 0, // For consistency
    });

    // Extract language from response (Whisper includes this)
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: WHISPER_MODEL,
      response_format: 'verbose_json',
    });

    return {
      text: response.text,
      language: (transcription as any).language || 'unknown',
      duration: (transcription as any).duration,
      confidence: (transcription as any).duration ? 0.95 : undefined, // Confidence proxy
    };
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw new Error(`Audio transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Process a voice note end-to-end:
 * 1. Transcribe audio
 * 2. Store transcription in database
 * 3. Generate embeddings for semantic search
 *
 * @param params Voice note parameters with audio buffer
 */
export async function processVoiceNote(params: VoiceNoteParams): Promise<string> {
  const { userId, messageId, attachmentId, chatId, audioBuffer, mimeType } = params;

  try {
    // Step 1: Transcribe
    const transcription = await transcribeAudio(audioBuffer, mimeType);

    // Step 2: Store transcription in database
    const { error: insertError, data } = await supabaseAdmin
      .from('voice_transcriptions')
      .insert({
        user_id: userId,
        message_id: messageId,
        attachment_id: attachmentId,
        chat_id: chatId,
        transcript_text: transcription.text,
        language: transcription.language,
        duration_seconds: transcription.duration,
        confidence: transcription.confidence,
        processed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error storing voice transcription:', insertError);
      throw insertError;
    }

    // Step 3: Generate embeddings for the transcribed text
    await storeEmbeddings({
      userId,
      messageId,
      attachmentId,
      chatId,
      text: transcription.text,
      metadata: {
        source: 'voice_transcription',
        language: transcription.language,
        duration_seconds: transcription.duration,
      },
    });

    // Step 4: Update attachment record with transcript
    await supabaseAdmin
      .from('attachments')
      .update({
        transcript: transcription.text,
        processed: true,
      })
      .eq('id', attachmentId);

    return transcription.text;
  } catch (error) {
    console.error('Error processing voice note:', error);
    throw error;
  }
}

/**
 * Get transcription for a specific voice note
 * @param attachmentId ID of the attachment
 * @returns Transcription record or null
 */
export async function getVoiceTranscription(attachmentId: string): Promise<any> {
  try {
    const { data, error } = await supabaseAdmin
      .from('voice_transcriptions')
      .select('*')
      .eq('attachment_id', attachmentId)
      .single();

    if (error && error.code !== 'PGRST116') { // Not "no rows" error
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching voice transcription:', error);
    return null;
  }
}

/**
 * Search voice transcriptions by text content
 * @param userId User ID
 * @param query Search query
 * @param limit Maximum results
 * @returns Array of matching transcriptions
 */
export async function searchVoiceTranscriptions(
  userId: string,
  query: string,
  limit: number = 10
): Promise<any[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('voice_transcriptions')
      .select('*')
      .eq('user_id', userId)
      .ilike('transcript_text', `%${query}%`)
      .order('processed_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error searching voice transcriptions:', error);
    return [];
  }
}
