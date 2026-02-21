import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
    verifyWebhookSignature,
    parseWebhookPayload,
    downloadMedia,
    markAsRead,
    sendTextMessage,
    hasMedia,
    getMediaInfo,
    getMessageType,
    type WebhookPayload,
    type WhatsAppMessage,
} from '@/lib/whatsapp';
import { uploadFile, getFileTypeFromMime } from '@/lib/storage';
import { storeEmbeddings } from '@/lib/embeddings';
import { queryRAG } from '@/lib/rag';

// ============================================================
// WhatsApp Webhook Endpoint
// Handles verification (GET) and incoming messages (POST)
// ============================================================

// --- GET: Webhook Verification ---
export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('[Webhook] Verification successful');
        return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[Webhook] Verification failed');
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// --- POST: Incoming Messages ---
export async function POST(req: NextRequest) {
    try {
          const rawBody = await req.text();

      // Verify signature
      const signature = req.headers.get('x-hub-signature-256') || '';
          if (!verifyWebhookSignature(rawBody, signature)) {
                  console.warn('[Webhook] Invalid signature');
                  return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
          }

      const payload: WebhookPayload = JSON.parse(rawBody);

      // Log the raw webhook
      await supabaseAdmin.from('webhook_logs').insert({
              payload,
              source: 'whatsapp',
      });

      // Parse messages from the payload
      const parsedMessages = parseWebhookPayload(payload);

      // Process each message
      for (const { message, senderPhone, senderName, phoneNumberId } of parsedMessages) {
              try {
                        await processIncomingMessage(message, senderPhone, senderName, phoneNumberId);
              } catch (err) {
                        console.error(`[Webhook] Error processing message ${message.id}:`, err);
              }
      }

      // Always return 200 to acknowledge receipt
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    } catch (error) {
          console.error('[Webhook] Error:', error);
          return NextResponse.json({ status: 'ok' }, { status: 200 });
    }
}

// ============================================================
// Message Processing Pipeline
// ============================================================

async function processIncomingMessage(
    message: WhatsAppMessage,
    senderPhone: string,
    senderName: string,
    phoneNumberId: string
  ) {
    // Step 1: Get or create user (by phone number association)
  const user = await getOrCreateUser(phoneNumberId);
    if (!user) {
          console.warn('[Webhook] No user found for phone number ID:', phoneNumberId);
          return;
    }

  // Step 2: Get or create contact
  const contact = await getOrCreateContact(user.id, senderPhone, senderName);

  // Step 3: Get or create chat
  const chat = await getOrCreateChat(user.id, senderPhone, senderName);

  // Step 4: Store the message
  const messageType = getMessageType(message.type);
    const textContent = message.text?.body
      || message.image?.caption
      || message.video?.caption
      || message.document?.caption
      || (message.location ? `Location: ${message.location.latitude}, ${message.location.longitude}` : null);

  const { data: storedMessage, error: msgError } = await supabaseAdmin
      .from('messages')
      .upsert(
        {
                  user_id: user.id,
                  chat_id: chat.id,
                  contact_id: contact.id,
                  wa_message_id: message.id,
                  sender_phone: senderPhone,
                  sender_name: senderName,
                  message_type: messageType,
                  text_content: textContent,
                  raw_payload: message,
                  is_from_me: false,
                  timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
        },
        { onConflict: 'user_id,wa_message_id' }
            )
      .select()
      .single();

  if (msgError) {
        console.error('[Webhook] Error storing message:', msgError);
        return;
  }

  // Step 5: Update chat's last_message_at
  await supabaseAdmin
      .from('chats')
      .update({ last_message_at: storedMessage.timestamp })
      .eq('id', chat.id);

  // Step 6: Handle media attachments
  if (hasMedia(message)) {
        await processMediaAttachment(message, user.id, storedMessage.id, chat.id, senderName);
  }

  // Step 7: Generate embeddings for text messages
  if (textContent && textContent.length > 10) {
        try {
                await storeEmbeddings({
                          userId: user.id,
                          messageId: storedMessage.id,
                          chatId: chat.id,
                          text: textContent,
                          metadata: {
                                      sender_name: senderName,
                                      sender_phone: senderPhone,
                                      timestamp: storedMessage.timestamp,
                                      chat_title: chat.title,
                                      message_type: messageType,
                          },
                });
        } catch (err) {
                console.error('[Webhook] Error generating embeddings:', err);
        }
  }

  // Step 8: Check if this is a bot command and respond
  if (textContent && isCommand(textContent)) {
        await handleBotCommand(textContent, user.id, senderPhone, chat.id);
  }

  // Mark message as read
  await markAsRead(message.id);
}

// ============================================================
// Helper Functions
// ============================================================

async function getOrCreateUser(phoneNumberId: string) {
    // For now, find user by their linked phone number
  const { data: user } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('phone', phoneNumberId)
      .single();

  return user;
}

async function getOrCreateContact(userId: string, waId: string, displayName: string) {
    const { data: existing } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .eq('wa_id', waId)
      .single();

  if (existing) {
        if (displayName && displayName !== existing.display_name) {
                await supabaseAdmin
                  .from('contacts')
                  .update({ display_name: displayName })
                  .eq('id', existing.id);
        }
        return existing;
  }

  const { data: newContact } = await supabaseAdmin
      .from('contacts')
      .insert({ user_id: userId, wa_id: waId, display_name: displayName })
      .select()
      .single();

  return newContact;
}

async function getOrCreateChat(userId: string, senderPhone: string, senderName: string) {
    const chatId = senderPhone; // For individual chats, use phone as chat ID

  const { data: existing } = await supabaseAdmin
      .from('chats')
      .select('*')
      .eq('user_id', userId)
      .eq('wa_chat_id', chatId)
      .single();

  if (existing) return existing;

  const { data: newChat } = await supabaseAdmin
      .from('chats')
      .insert({
              user_id: userId,
              wa_chat_id: chatId,
              chat_type: 'individual',
              title: senderName || senderPhone,
      })
      .select()
      .single();

  return newChat;
}

async function processMediaAttachment(
    message: WhatsAppMessage,
    userId: string,
    messageId: string,
    chatId: string,
    senderName: string
  ) {
    const mediaInfo = getMediaInfo(message);
    if (!mediaInfo) return;

  try {
        // Download from WhatsApp
      const { buffer, mimeType, fileSize } = await downloadMedia(mediaInfo.id);

      // Upload to Backblaze B2
      const fileName = (message as any).document?.filename || `${message.type}_${Date.now()}`;
        const { storageUrl, storageKey } = await uploadFile(buffer, userId, mimeType, fileName);

      // Store attachment metadata
      const { data: attachment } = await supabaseAdmin
          .from('attachments')
          .insert({
                    message_id: messageId,
                    user_id: userId,
                    file_type: getFileTypeFromMime(mimeType),
                    mime_type: mimeType,
                    file_name: fileName,
                    file_size_bytes: fileSize,
                    storage_url: storageUrl,
                    storage_key: storageKey,
                    processed: false,
          })
          .select()
          .single();

      console.log(`[Webhook] Stored attachment: ${attachment?.id} (${mimeType})`);
  } catch (err) {
        console.error('[Webhook] Error processing media:', err);
  }
}

// ============================================================
// Bot Command Handler
// ============================================================

function isCommand(text: string): boolean {
    const commands = ['summary', 'find', 'search', 'show', 'help'];
    const firstWord = text.toLowerCase().trim().split(/\s+/)[0];
    return commands.includes(firstWord);
}

async function handleBotCommand(
    text: string,
    userId: string,
    senderPhone: string,
    chatId: string
  ) {
    const parts = text.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

  try {
        switch (command) {
          case 'help': {
                    const helpText =
                                `*ChatVault Commands:*\n\n` +
                                `*find* [keyword] - Search your messages\n` +
                                `*summary* last [N] days - Get a chat summary\n` +
                                `*show* documents about [topic] - Find documents\n` +
                                `*help* - Show this help message`;
                    await sendTextMessage(senderPhone, helpText);
                    break;
          }

          case 'find':
          case 'search': {
                    if (!args) {
                                await sendTextMessage(senderPhone, 'Please specify what to search for. Example: find MRI report');
                                return;
                    }
                    const result = await queryRAG({ userId, query: args, maxResults: 5 });
                    let response = result.answer;
                    if (result.relatedAttachments.length > 0) {
                                response += `\n\n*Related files:* ${result.relatedAttachments.map((a) => a.fileName).join(', ')}`;
                    }
                    // Truncate if too long for WhatsApp
                    if (response.length > 4000) {
                                response = response.substring(0, 3950) + '\n\n...truncated. View full results on the dashboard.';
                    }
                    await sendTextMessage(senderPhone, response);
                    break;
          }

          case 'summary': {
                    const daysMatch = args.match(/last\s+(\d+)\s+days?/i);
                    const days = daysMatch ? parseInt(daysMatch[1]) : 3;
                    const dateTo = new Date().toISOString();
                    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

                    // Import dynamically to avoid circular deps
                    const { generateChatSummary } = await import('@/lib/rag');
                    const summary = await generateChatSummary({ userId, chatId, dateFrom, dateTo });

                    let response = `*Summary (last ${days} days):*\n\n${summary.summary}`;
                    if (summary.actionItems.length > 0) {
                                response += `\n\n*Action Items:*\n${summary.actionItems.map((a) => `- ${a}`).join('\n')}`;
                    }
                    await sendTextMessage(senderPhone, response);
                    break;
          }

          case 'show': {
                    const result = await queryRAG({
                                userId,
                                query: args || 'documents',
                                maxResults: 5,
                                includeAttachments: true,
                    });
                    let response = result.answer;
                    if (result.relatedAttachments.length > 0) {
                                response += '\n\n*Matching documents:*\n';
                                result.relatedAttachments.forEach((a, i) => {
                                              response += `${i + 1}. ${a.fileName} (${a.fileType})\n`;
                                });
                    }
                    await sendTextMessage(senderPhone, response);
                    break;
          }

          default:
                    await sendTextMessage(senderPhone, 'Unknown command. Type *help* for available commands.');
        }
  } catch (err) {
        console.error('[Bot] Command error:', err);
        await sendTextMessage(senderPhone, 'Sorry, something went wrong. Please try again.');
  }
}
