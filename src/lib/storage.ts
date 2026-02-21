import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Backblaze B2 Storage Client (S3-compatible)
// ============================================================

const s3Client = new S3Client({
    endpoint: process.env.B2_ENDPOINT!,
        region: 'us-east-005',
    credentials: {
          accessKeyId: process.env.B2_APPLICATION_KEY_ID!,
          secretAccessKey: process.env.B2_APPLICATION_KEY!,
    },
});

const BUCKET_NAME = process.env.B2_BUCKET_NAME!;

// --- MIME type to extension mapping ---
const MIME_EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/aac': 'aac',
    'audio/opus': 'opus',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
};

// --- Upload File ---

export async function uploadFile(
    buffer: Buffer,
    userId: string,
    mimeType: string,
    originalFilename?: string
  ): Promise<{ storageUrl: string; storageKey: string }> {
    const extension = MIME_EXTENSIONS[mimeType] || 'bin';
    const fileId = uuidv4();
    const key = `${userId}/${fileId}.${extension}`;

  await s3Client.send(
        new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
                Metadata: {
                          'original-filename': originalFilename || 'unknown',
                          'user-id': userId,
                },
        })
      );

  const storageUrl = `${process.env.B2_ENDPOINT}/${BUCKET_NAME}/${key}`;
    return { storageUrl, storageKey: key };
}

// --- Get Signed URL (for temporary access) ---

export async function getSignedDownloadUrl(
    storageKey: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: storageKey,
    });
    return getSignedUrl(s3Client, command, { expiresIn });
}

// --- Delete File ---

export async function deleteFile(storageKey: string): Promise<void> {
    await s3Client.send(
          new DeleteObjectCommand({
                  Bucket: BUCKET_NAME,
                  Key: storageKey,
          })
        );
}

// --- Get file type category ---

export function getFileTypeFromMime(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'document';
    if (mimeType.includes('document') || mimeType.includes('sheet')) return 'document';
    return 'document';
}
