import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { withAuth, apiError, apiSuccess } from '@/lib/api-utils';

// ============================================================
// Attachment Presigned URL API
// Returns a temporary signed URL for accessing attachments
// ============================================================

export const GET = withAuth(async (
    request: NextRequest,
    { user },
) => {
    // Extract attachment ID from URL
    const urlParts = request.nextUrl.pathname.split('/');
    const attachmentId = urlParts[urlParts.length - 1];

    if (!attachmentId) {
        return apiError('Attachment ID is required', 400);
    }

    // Look up attachment and verify ownership
    const { data: attachment, error } = await supabaseAdmin
        .from('attachments')
        .select('storage_key, user_id, file_name, mime_type')
        .eq('id', attachmentId)
        .single();

    if (error || !attachment) {
        return apiError('Attachment not found', 404);
    }

    if (attachment.user_id !== user.id) {
        return apiError('Forbidden', 403);
    }

    // Check if thumbnail is requested
    const isThumbnail = request.nextUrl.searchParams.get('thumbnail') === 'true';

    // Generate presigned URL (1 hour expiry)
    const signedUrl = await getSignedDownloadUrl(attachment.storage_key, 3600);

    if (isThumbnail) {
        // For thumbnails, redirect to the signed URL
        return NextResponse.redirect(signedUrl);
    }

    return apiSuccess({
        url: signedUrl,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
    });
});
