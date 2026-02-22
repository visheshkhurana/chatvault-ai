import Tesseract from 'tesseract.js';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import { supabaseAdmin } from '../lib/supabase';
import { storeEmbeddings } from '../lib/embeddings';

// ============================================================
// Attachment Processor Worker
// Processes unprocessed attachments: OCR, PDF parse, transcription
// Run via: npm run process:attachments
// ============================================================

// Use OPENAI_API_KEY for Whisper transcription (direct OpenAI API required)
// Fall back to OPENROUTER_API_KEY if OPENAI_API_KEY is not set
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY!,
    ...(process.env.OPENAI_API_KEY ? {} : { baseURL: 'https://openrouter.ai/api/v1' }),
});
const BATCH_SIZE = 10;

// --- Graceful Shutdown ---
let isShuttingDown = false;
function setupGracefulShutdown() {
    const shutdown = (signal: string) => {
        console.log(`[AttachmentProcessor] Received ${signal}. Finishing current batch...`);
        isShuttingDown = true;
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function main() {
    console.log('[AttachmentProcessor] Starting...');
    setupGracefulShutdown();

  while (!isShuttingDown) {
        // Fetch unprocessed attachments
      const { data: attachments, error } = await supabaseAdmin
          .from('attachments')
          .select(`
                  *,
                          messages!inner(user_id, chat_id, sender_name, timestamp)
                                `)
          .eq('processed', false)
          .limit(BATCH_SIZE)
          .order('created_at', { ascending: true });

      if (error) {
              console.error('[AttachmentProcessor] Fetch error:', error);
              await sleep(5000);
              continue;
      }

      if (!attachments || attachments.length === 0) {
              console.log('[AttachmentProcessor] No unprocessed attachments. Waiting...');
              await sleep(30000); // Wait 30 seconds
          continue;
      }

      console.log(`[AttachmentProcessor] Processing ${attachments.length} attachments`);

      for (const attachment of attachments) {
              try {
                        await processAttachment(attachment);
              } catch (err) {
                        console.error(`[AttachmentProcessor] Error processing ${attachment.id}:`, err);
                        await supabaseAdmin
                          .from('attachments')
                          .update({ processed: true, metadata: { ...attachment.metadata, error: String(err) } })
                          .eq('id', attachment.id);
              }
      }
  }
}

async function processAttachment(attachment: any) {
    const { id, file_type, mime_type, storage_url, user_id, message_id } = attachment;
    const message = attachment.messages;
    let extractedText = '';

  console.log(`[AttachmentProcessor] Processing ${id} (${file_type})`);

  switch (file_type) {
    case 'image':
            extractedText = await processImage(storage_url);
            await supabaseAdmin
              .from('attachments')
              .update({ ocr_text: extractedText, processed: true })
              .eq('id', id);
            break;

    case 'document':
            if (mime_type === 'application/pdf') {
                      extractedText = await processPDF(storage_url);
                      await supabaseAdmin
                        .from('attachments')
                        .update({ pdf_text: extractedText, processed: true })
                        .eq('id', id);
            } else {
                      await supabaseAdmin
                        .from('attachments')
                        .update({ processed: true })
                        .eq('id', id);
            }
            break;

    case 'audio':
    case 'voice':
            extractedText = await transcribeAudio(storage_url);
            await supabaseAdmin
              .from('attachments')
              .update({ transcript: extractedText, processed: true })
              .eq('id', id);
            break;

    default:
            await supabaseAdmin
              .from('attachments')
              .update({ processed: true })
              .eq('id', id);
            return;
  }

  // Generate embeddings for extracted text
  if (extractedText && extractedText.length > 10) {
        await storeEmbeddings({
                userId: user_id,
                messageId: message_id,
                attachmentId: id,
                chatId: message.chat_id,
                text: extractedText,
                metadata: {
                          sender_name: message.sender_name,
                          timestamp: message.timestamp,
                          file_type,
                          file_name: attachment.file_name,
                          source: 'attachment',
                },
        });
        console.log(`[AttachmentProcessor] Generated embeddings for ${id}`);
  }
}

// --- OCR: Extract text from images ---

async function processImage(imageUrl: string): Promise<string> {
    try {
          console.log('[OCR] Processing image...');

      // Try Tesseract.js first (free)
      const result = await Tesseract.recognize(imageUrl, 'eng', {
              logger: (info: any) => {
                        if (info.status === 'recognizing text') {
                                    process.stdout.write(`\r[OCR] Progress: ${Math.round(info.progress * 100)}%`);
                        }
              },
      });

      const text = result.data.text.trim();
          console.log(`\n[OCR] Extracted ${text.length} characters`);

      // If Tesseract result is poor, try Google Cloud Vision as fallback
      if (text.length < 10 && process.env.GOOGLE_CLOUD_VISION_API_KEY) {
              return await processImageWithVision(imageUrl);
      }

      return text;
    } catch (err) {
          console.error('[OCR] Tesseract error:', err);
          if (process.env.GOOGLE_CLOUD_VISION_API_KEY) {
                  return await processImageWithVision(imageUrl);
          }
          return '';
    }
}

// --- Google Cloud Vision OCR (high accuracy fallback) ---

async function processImageWithVision(imageUrl: string): Promise<string> {
    try {
          console.log('[OCR] Using Google Cloud Vision...');
          const response = await fetch(
                  `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_CLOUD_VISION_API_KEY}`,
            {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                                  requests: [
                                    {
                                                    image: { source: { imageUri: imageUrl } },
                                                    features: [{ type: 'TEXT_DETECTION' }],
                                    },
                                              ],
                      }),
            }
                );

      const data = await response.json();
          const text = data.responses?.[0]?.fullTextAnnotation?.text || '';
          console.log(`[OCR:Vision] Extracted ${text.length} characters`);
          return text;
    } catch (err) {
          console.error('[OCR:Vision] Error:', err);
          return '';
    }
}

// --- PDF: Extract text from PDF documents ---

async function processPDF(pdfUrl: string): Promise<string> {
    try {
          console.log('[PDF] Processing PDF...');
          const response = await fetch(pdfUrl);
          const buffer = Buffer.from(await response.arrayBuffer());
          const data = await pdfParse(buffer);

      console.log(`[PDF] Extracted ${data.text.length} characters from ${data.numpages} pages`);
          return data.text;
    } catch (err) {
          console.error('[PDF] Error:', err);
          return '';
    }
}

// --- Audio: Transcribe voice notes and audio ---

async function transcribeAudio(audioUrl: string): Promise<string> {
    try {
          console.log('[Audio] Transcribing audio...');
          const response = await fetch(audioUrl);
          const buffer = Buffer.from(await response.arrayBuffer());

      // Create a File-like object for OpenAI
      const file = new File([buffer], 'audio.ogg', { type: 'audio/ogg' });

      const transcription = await openai.audio.transcriptions.create({
              model: 'whisper-1',
              file,
      });

      console.log(`[Audio] Transcribed ${transcription.text.length} characters`);
          return transcription.text;
    } catch (err) {
          console.error('[Audio] Transcription error:', err);
          return '';
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the worker
main()
    .then(() => {
        console.log('[AttachmentProcessor] Shut down gracefully.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('[AttachmentProcessor] Fatal error:', err);
        process.exit(1);
    });
