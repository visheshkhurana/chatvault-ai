import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { processVoiceNote } from '@/lib/voice-transcription';
import { z } from 'zod';

// ============================================================
// Voice Notes API
// GET /api/voice-notes — List transcriptions for user
// POST /api/voice-notes — Trigger transcription for attachment
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');
    const searchQuery = searchParams.get('search');

    let query = supabaseAdmin
      .from('attachments')
      .select('id, message_id, chat_id, file_name, transcript, created_at, messages(sender_name, timestamp)')
      .eq('user_id', user.id)
      .not('transcript', 'is', null)
      .order('created_at', { ascending: false });

    if (chatId) {
      query = query.eq('chat_id', chatId);
    }

    const { data: transcriptions, error } = await query;

    if (error) {
      console.error('[Voice Notes] Query error:', error);
      return apiError('Failed to fetch transcriptions', 500);
    }

    if (!transcriptions) {
      return apiSuccess([]);
    }

    // Apply text search if provided
    let filtered = transcriptions;
    if (searchQuery) {
      const lowerSearch = searchQuery.toLowerCase();
      filtered = transcriptions.filter(
        (att) => att.transcript?.toLowerCase().includes(lowerSearch)
      );
    }

    const result = filtered.map((att) => ({
      id: att.id,
      messageId: att.message_id,
      chatId: att.chat_id,
      fileName: att.file_name,
      transcript: att.transcript,
      senderName: (att.messages as any)?.sender_name,
      messageTimestamp: (att.messages as any)?.timestamp,
      createdAt: att.created_at,
    }));

    return apiSuccess(result);
  } catch (err) {
    console.error('[Voice Notes] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const transcribeSchema = z.object({
  attachmentId: z.string().uuid(),
  messageId: z.string().uuid(),
  chatId: z.string().uuid(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, transcribeSchema);
  if (!parsed.success) return parsed.response;

  const { attachmentId, messageId, chatId } = parsed.data as z.infer<typeof transcribeSchema>;

  try {
    // Fetch attachment metadata
    const { data: attachment, error: attachError } = await supabaseAdmin
      .from('attachments')
      .select('*')
      .eq('id', attachmentId)
      .eq('user_id', user.id)
      .single();

    if (attachError || !attachment) {
      return apiError('Attachment not found', 404);
    }

    // Download audio from storage
    const { data: audioData } = await supabaseAdmin.storage
      .from('attachments')
      .download(attachment.storage_url);

    if (!audioData) {
      return apiError('Could not download audio file', 500);
    }

    const audioBuffer = Buffer.from(await audioData.arrayBuffer());

    // Process voice note (transcribe)
    const transcription = await processVoiceNote({
      attachmentId,
      audioBuffer,
      mimeType: attachment.file_type || 'audio/ogg',
      messageId,
      chatId: attachment.chat_id || '',
      userId: user.id,
    });

    // Update attachment with transcription
    await supabaseAdmin
      .from('attachments')
      .update({ transcript: transcription })
      .eq('id', attachmentId);

    return apiSuccess({
      transcription,
      attachmentId,
    });
  } catch (err) {
    console.error('[Voice Notes] Transcription error:', err);
    return apiError('Failed to transcribe audio', 500);
  }
});
