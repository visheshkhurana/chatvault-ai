import crypto from 'crypto';

// ============================================================
// WhatsApp Cloud API Client
// ============================================================

const GRAPH_API_URL = 'https://graph.facebook.com/v19.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET!;

// --- Types ---

export interface WhatsAppMessage {
    from: string;
    id: string;
    timestamp: string;
    type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contacts' | 'reaction';
    text?: { body: string };
    image?: WhatsAppMedia;
    video?: WhatsAppMedia;
    audio?: WhatsAppMedia;
    document?: WhatsAppMedia & { filename: string };
    sticker?: WhatsAppMedia;
    location?: { latitude: number; longitude: number; name?: string; address?: string };
    contacts?: any[];
    reaction?: { message_id: string; emoji: string };
    context?: { from: string; id: string };
}

export interface WhatsAppMedia {
    id: string;
    mime_type: string;
    sha256?: string;
    caption?: string;
}

export interface WebhookPayload {
    object: string;
    entry: Array<{
      id: string;
      changes: Array<{
        value: {
          messaging_product: string;
          metadata: { display_phone_number: string; phone_number_id: string };
          contacts?: Array<{ profile: { name: string }; wa_id: string }>;
          messages?: WhatsAppMessage[];
          statuses?: any[];
        };
        field: string;
      }>;
    }>;
}

// --- Signature Verification ---

export function verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string
  ): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', APP_SECRET)
      .update(rawBody)
      .digest('hex');
    const expected = `sha256=${expectedSignature}`;
    // Use constant-time comparison to prevent timing attacks
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
}

// --- Send Messages ---

export async function sendTextMessage(to: string, text: string): Promise<any> {
    const response = await fetch(
          `${GRAPH_API_URL}/${PHONE_NUMBER_ID}/messages`,
      {
              method: 'POST',
              headers: {
                        'Authorization': `Bearer ${ACCESS_TOKEN}`,
                        'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        to,
                        type: 'text',
                        text: { body: text },
              }),
      }
        );
    return response.json();
}

export async function sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string = 'en',
    parameters: Array<{ type: string; text: string }> = []
  ): Promise<any> {
    const body: any = {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
                  name: templateName,
                  language: { code: languageCode },
          },
    };

  if (parameters.length > 0) {
        body.template.components = [
          {
                    type: 'body',
                    parameters: parameters.map((p) => ({ type: p.type, text: p.text })),
          },
              ];
  }

  const response = await fetch(
        `${GRAPH_API_URL}/${PHONE_NUMBER_ID}/messages`,
    {
            method: 'POST',
            headers: {
                      'Authorization': `Bearer ${ACCESS_TOKEN}`,
                      'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
    }
      );
    return response.json();
}

// --- Download Media ---

export async function downloadMedia(mediaId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    fileSize: number;
}> {
    // Step 1: Get media URL
  const mediaInfoRes = await fetch(`${GRAPH_API_URL}/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
  });
    const mediaInfo = await mediaInfoRes.json();

  // Step 2: Download the actual file
  const fileRes = await fetch(mediaInfo.url, {
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
  });
    const buffer = Buffer.from(await fileRes.arrayBuffer());

  return {
        buffer,
        mimeType: mediaInfo.mime_type,
        fileSize: buffer.length,
  };
}

// --- Mark as Read ---

export async function markAsRead(messageId: string): Promise<void> {
    await fetch(`${GRAPH_API_URL}/${PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
                  'Authorization': `Bearer ${ACCESS_TOKEN}`,
                  'Content-Type': 'application/json',
          },
          body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  status: 'read',
                  message_id: messageId,
          }),
    });
}

// --- Parse Webhook Payload ---

export function parseWebhookPayload(payload: WebhookPayload) {
    const results: Array<{
          message: WhatsAppMessage;
          senderPhone: string;
          senderName: string;
          phoneNumberId: string;
    }> = [];

  for (const entry of payload.entry) {
        for (const change of entry.changes) {
                if (change.field !== 'messages') continue;
                const { messages, contacts, metadata } = change.value;
                if (!messages) continue;

          for (const message of messages) {
                    const contact = contacts?.find((c) => c.wa_id === message.from);
                    results.push({
                                message,
                                senderPhone: message.from,
                                senderName: contact?.profile?.name || message.from,
                                phoneNumberId: metadata.phone_number_id,
                    });
          }
        }
  }

  return results;
}

// --- Determine message type for DB ---

export function getMessageType(
    waType: string
  ): string {
    const typeMap: Record<string, string> = {
          text: 'text',
          image: 'image',
          video: 'video',
          audio: 'audio',
          document: 'document',
          sticker: 'sticker',
          location: 'location',
          contacts: 'contact',
          reaction: 'reaction',
    };
    return typeMap[waType] || 'text';
}

// --- Check if message has media ---

export function hasMedia(message: WhatsAppMessage): boolean {
    return ['image', 'video', 'audio', 'document', 'sticker'].includes(message.type);
}

// --- Get media info from message ---

export function getMediaInfo(message: WhatsAppMessage): WhatsAppMedia | null {
    switch (message.type) {
      case 'image': return message.image || null;
      case 'video': return message.video || null;
      case 'audio': return message.audio || null;
      case 'document': return message.document || null;
      case 'sticker': return message.sticker || null;
      default: return null;
    }
}
