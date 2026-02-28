import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withAuth, parseBody, apiSuccess, apiError } from '@/lib/api-utils';
import { z } from 'zod';

// ============================================================
// Audio Captures API
// GET /api/audio-captures — List audio captures
// POST /api/audio-captures — Upload a new audio capture
// PATCH /api/audio-captures — Update transcription status
// ============================================================

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { data: captures, error } = await supabaseAdmin
      .from('audio_captures')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Audio Captures] Query error:', error);
      return apiError('Failed to fetch captures', 500);
    }

    return apiSuccess(captures || []);
  } catch (err) {
    console.error('[Audio Captures] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const createCaptureSchema = z.object({
  storageUrl: z.string().url(),
  storageKey: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().optional(),
});

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, createCaptureSchema);
  if (!parsed.success) return parsed.response;

  const { storageUrl, storageKey, fileName, mimeType } =
    parsed.data as z.infer<typeof createCaptureSchema>;

  try {
    const { data: capture, error } = await supabaseAdmin
      .from('audio_captures')
      .insert({
        user_id: user.id,
        storage_url: storageUrl,
        storage_key: storageKey,
        file_name: fileName,
        mime_type: mimeType || 'audio/mpeg',
        status: 'pending_transcription',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[Audio Captures] Insert error:', error);
      return apiError('Failed to create capture', 500);
    }

    return apiSuccess(capture, 201);
  } catch (err) {
    console.error('[Audio Captures] Error:', err);
    return apiError('Internal server error', 500);
  }
});

const updateCaptureSchema = z.object({
  captureId: z.string().uuid(),
  transcription: z.string().optional(),
  status: z.enum(['pending_transcription', 'transcribing', 'transcribed', 'failed']).optional(),
});

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const parsed = await parseBody(req, updateCaptureSchema);
  if (!parsed.success) return parsed.response;

  const { captureId, transcription, status } =
    parsed.data as z.infer<typeof updateCaptureSchema>;

  try {
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (transcription !== undefined) updates.transcription = transcription;
    if (status !== undefined) updates.status = status;

    const { error } = await supabaseAdmin
      .from('audio_captures')
      .update(updates)
      .eq('id', captureId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[Audio Captures] Update error:', error);
      return apiError('Failed to update capture', 500);
    }

    return apiSuccess({ success: true });
  } catch (err) {
    console.error('[Audio Captures] Error:', err);
    return apiError('Internal server error', 500);
  }
});
