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
    // phoneNumberId is Meta's business phone number ID, not the user's phone
    // Look up user by wa_phone_number_id (the Meta-assigned ID for their WhatsApp Business number)
    // Fallback: also check phone field for backward compatibility
    const { data: user } = await supabaseAdmin
        .from('users')
        .select('*')
        .or(`wa_phone_number_id.eq.${phoneNumberId},phone.eq.${phoneNumberId}`)
        .limit(1)
        .maybeSingle();

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
    const commands = ['summary', 'find', 'search', 'show', 'help', 'remind', 'brief', 'status', 'summarize'];
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
                                `*Rememora Commands:*\n\n` +
                                `*find* [keyword] - Search your messages\n` +
                                `*search* [keyword] - Search your messages\n` +
                                `*summary* last [N] days - Get a chat summary\n` +
                                `*summarize* [group name] or [time period] - Enhanced summary\n` +
                                `*show* documents about [topic] - Find documents\n` +
                                `*brief* [contact name] - Get contact briefing\n` +
                                `*remind* [task] by [date] or remind me to [task] - Create reminder\n` +
                                `*status* - Show your Rememora stats\n` +
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

          case 'summarize': {
                    // Parse group name or time period from args
                    let targetChatId = chatId;
                    let daysForSummary = 3;

                    if (args) {
                                // Check if args contains a time period like "last 7 days"
                                const daysMatch = args.match(/last\s+(\d+)\s+days?/i);
                                if (daysMatch) {
                                              daysForSummary = parseInt(daysMatch[1]);
                                } else {
                                              // Treat args as group/chat name and try to find it
                                              const { data: chats } = await supabaseAdmin
                                                            .from('chats')
                                                            .select('*')
                                                            .eq('user_id', userId)
                                                            .ilike('title', `%${args}%`)
                                                            .limit(1);
                                              if (chats && chats.length > 0) {
                                                            targetChatId = chats[0].id;
                                              }
                                }
                    }

                    const dateTo = new Date().toISOString();
                    const dateFrom = new Date(Date.now() - daysForSummary * 24 * 60 * 60 * 1000).toISOString();

                    const { generateChatSummary } = await import('@/lib/rag');
                    const summary = await generateChatSummary({ userId, chatId: targetChatId, dateFrom, dateTo });

                    let response = `*Summary (last ${daysForSummary} days):*\n\n${summary.summary}`;
                    if (summary.actionItems && summary.actionItems.length > 0) {
                                response += `\n\n*Action Items:*\n${summary.actionItems.map((a) => `- ${a}`).join('\n')}`;
                    }
                    await sendTextMessage(senderPhone, response);
                    break;
          }

          case 'remind': {
                    if (!args) {
                                await sendTextMessage(senderPhone, 'Please specify a reminder. Example: remind me to call John or remind buy groceries by tomorrow');
                                return;
                    }

                    // Parse natural language date and task
                    const dueDate = parseNaturalDate(args);
                    if (!dueDate) {
                                await sendTextMessage(senderPhone, 'I couldn\'t understand the date. Please use formats like: tomorrow, next monday, in 2 hours, by 3pm');
                                return;
                    }

                    // Extract task text (remove "by [date]" or "me to" parts)
                    let taskText = args;
                    taskText = taskText.replace(/\s+by\s+.+$/i, '').trim();
                    if (taskText.toLowerCase().startsWith('me to ')) {
                                taskText = taskText.substring(6);
                    }

                    const { data: reminder, error: reminderError } = await supabaseAdmin
                                .from('reminders')
                                .insert({
                                              user_id: userId,
                                              chat_id: chatId,
                                              text: taskText,
                                              due_at: dueDate.toISOString(),
                                              status: 'pending',
                                              created_at: new Date().toISOString(),
                                })
                                .select()
                                .single();

                    if (reminderError) {
                                console.error('[Bot] Error creating reminder:', reminderError);
                                await sendTextMessage(senderPhone, 'Sorry, I couldn\'t create the reminder. Please try again.');
                                return;
                    }

                    await sendTextMessage(senderPhone, `✓ Reminder set: "${taskText}" due ${dueDate.toLocaleDateString()}`);
                    break;
          }

          case 'brief': {
                    if (!args) {
                                await sendTextMessage(senderPhone, 'Please specify a contact name. Example: brief John Smith');
                                return;
                    }

                    // Find contact by name
                    const { data: contacts } = await supabaseAdmin
                                .from('contacts')
                                .select('id, display_name, wa_id')
                                .eq('user_id', userId)
                                .ilike('display_name', `%${args}%`)
                                .limit(1);

                    if (!contacts || contacts.length === 0) {
                                await sendTextMessage(senderPhone, `No contact found with name "${args}"`);
                                return;
                    }

                    const contact = contacts[0];

                    // Get the chat for this contact
                    const { data: chats } = await supabaseAdmin
                                .from('chats')
                                .select('id')
                                .eq('user_id', userId)
                                .eq('wa_chat_id', contact.wa_id)
                                .limit(1);

                    if (!chats || chats.length === 0) {
                                await sendTextMessage(senderPhone, `No chat history with ${contact.display_name}`);
                                return;
                    }

                    const targetChatId = chats[0].id;

                    // Fetch last 50 messages from this contact
                    const { data: messages } = await supabaseAdmin
                                .from('messages')
                                .select('text_content, timestamp')
                                .eq('chat_id', targetChatId)
                                .eq('contact_id', contact.id)
                                .order('timestamp', { ascending: false })
                                .limit(50);

                    if (!messages || messages.length === 0) {
                                await sendTextMessage(senderPhone, `No messages from ${contact.display_name}`);
                                return;
                    }

                    // Generate brief summary of recent interactions
                    const messageTexts = messages
                                .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                .map((m: any) => m.text_content)
                                .filter(Boolean)
                                .join(' ');

                    if (messageTexts.length < 50) {
                                await sendTextMessage(senderPhone, `Brief for ${contact.display_name}:\n\n${messageTexts}`);
                                return;
                    }

                    // Use RAG to summarize
                    const { generateChatSummary } = await import('@/lib/rag');
                    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                    const summary = await generateChatSummary({
                                userId,
                                chatId: targetChatId,
                                dateFrom: lastWeek,
                                dateTo: new Date().toISOString(),
                    });

                    let response = `*Brief: ${contact.display_name}*\n\n${summary.summary}`;
                    if (summary.actionItems && summary.actionItems.length > 0) {
                                response += `\n\n*Recent topics:*\n${summary.actionItems.map((a) => `- ${a}`).join('\n')}`;
                    }
                    await sendTextMessage(senderPhone, response);
                    break;
          }

          case 'status': {
                    // Get total messages count
                    const { count: totalMessages } = await supabaseAdmin
                                .from('messages')
                                .select('id', { count: 'exact', head: true })
                                .eq('user_id', userId);

                    // Get total chats count
                    const { count: totalChats } = await supabaseAdmin
                                .from('chats')
                                .select('id', { count: 'exact', head: true })
                                .eq('user_id', userId);

                    // Get total contacts count
                    const { count: totalContacts } = await supabaseAdmin
                                .from('contacts')
                                .select('id', { count: 'exact', head: true })
                                .eq('user_id', userId);

                    // Get messages today
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const { count: messagesToday } = await supabaseAdmin
                                .from('messages')
                                .select('id', { count: 'exact', head: true })
                                .eq('user_id', userId)
                                .gte('timestamp', today.toISOString());

                    // Get pending reminders
                    const { count: pendingReminders } = await supabaseAdmin
                                .from('reminders')
                                .select('id', { count: 'exact', head: true })
                                .eq('user_id', userId)
                                .eq('status', 'pending');

                    const statusText =
                                `*Your Rememora Stats:*\n\n` +
                                `📊 Total Messages: ${totalMessages || 0}\n` +
                                `💬 Total Chats: ${totalChats || 0}\n` +
                                `👥 Total Contacts: ${totalContacts || 0}\n` +
                                `📅 Messages Today: ${messagesToday || 0}\n` +
                                `⏰ Pending Reminders: ${pendingReminders || 0}`;

                    await sendTextMessage(senderPhone, statusText);
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

// ============================================================
// Helper: Parse Natural Language Dates
// ============================================================

function parseNaturalDate(text: string): Date | null {
    const now = new Date();
    const lowerText = text.toLowerCase();

    // Check for "by [date]" format
    const byMatch = text.match(/by\s+(.+?)(?:\s+|$)/i);
    const dateStr = byMatch ? byMatch[1] : text;

    // Tomorrow
    if (dateStr.match(/tomorrow/i)) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow;
    }

    // Next [day of week]
    const dayMatch = dateStr.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (dayMatch) {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDay = days.indexOf(dayMatch[1].toLowerCase());
        const date = new Date(now);
        let daysAhead = targetDay - date.getDay();
        if (daysAhead <= 0) {
            daysAhead += 7;
        }
        date.setDate(date.getDate() + daysAhead);
        date.setHours(9, 0, 0, 0);
        return date;
    }

    // Today
    if (dateStr.match(/today/i)) {
        const later = new Date(now);
        later.setHours(now.getHours() + 2);
        return later;
    }

    // In [N] hours/days/weeks
    const inMatch = dateStr.match(/in\s+(\d+)\s+(hours?|days?|weeks?)/i);
    if (inMatch) {
        const amount = parseInt(inMatch[1]);
        const unit = inMatch[2].toLowerCase();
        const date = new Date(now);
        if (unit.startsWith('hour')) {
            date.setHours(date.getHours() + amount);
        } else if (unit.startsWith('day')) {
            date.setDate(date.getDate() + amount);
        } else if (unit.startsWith('week')) {
            date.setDate(date.getDate() + amount * 7);
        }
        return date;
    }

    // By [time] (today or tomorrow)
    const timeMatch = dateStr.match(/by\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const period = timeMatch[3];

        if (period && period.toLowerCase() === 'pm' && hour !== 12) {
            hour += 12;
        } else if (period && period.toLowerCase() === 'am' && hour === 12) {
            hour = 0;
        }

        const date = new Date(now);
        date.setHours(hour, minute, 0, 0);

        // If the time has passed, schedule for tomorrow
        if (date < now) {
            date.setDate(date.getDate() + 1);
        }
        return date;
    }

    // Default: if no date found, return tomorrow at 9am
    if (dateStr.trim().length > 0) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow;
    }

    return null;
}
