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
import { classifyIntent, logIntent, type ClassifiedIntent } from '@/lib/intent-classifier';
import { handleRetrieval } from '@/lib/retrieval-engine';
import { handleMeetingDetection, confirmLatestMeeting } from '@/lib/meeting-detector';
import { handleReminderCreation } from '@/lib/smart-reminder';
import { handleCommitmentDetection } from '@/lib/commitment-detector';

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

  // Step 8: Intent-based routing — classify and handle
  if (textContent && textContent.length > 2) {
        try {
              await handleIntentRouting(
                    textContent,
                    user,
                    senderPhone,
                    senderName,
                    chat.id,
                    contact?.id || null,
                    storedMessage.id
              );
        } catch (err) {
              console.error('[Webhook] Intent routing error:', err);
        }
  }

  // Step 9: Background — commitment detection (non-blocking)
  if (textContent && textContent.length > 10) {
        detectCommitmentsInBackground(
              user.id,
              senderPhone,
              textContent,
              chat.id,
              contact?.id || null,
              message.type !== 'text' ? false : true, // is_from_me is always false for incoming
              senderName
        ).catch(err => console.error('[Webhook] Commitment detection error:', err));
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
// Intent-Based Routing (NEW — replaces old isCommand check)
// ============================================================

async function handleIntentRouting(
    text: string,
    user: any,
    senderPhone: string,
    senderName: string,
    chatId: string,
    contactId: string | null,
    messageId: string
) {
    const userTimezone = user.timezone || 'UTC';

    // Check for quick confirmation patterns first (e.g., "yes" to confirm a meeting)
    const lowerText = text.toLowerCase().trim();
    if (['yes', 'yeah', 'yep', 'confirm', 'ok', 'sure', 'do it'].includes(lowerText)) {
        // Try to confirm a pending meeting
        const confirmed = await confirmLatestMeeting(supabaseAdmin, user.id, senderPhone);
        if (confirmed) return;
        // If no pending meeting, fall through to normal processing
    }

    // Classify intent via LLM
    const classified = await classifyIntent(text);

    // Log the intent (non-blocking)
    logIntent(supabaseAdmin, user.id, messageId, classified, 0).catch(() => {});

    // Route based on intent
    switch (classified.intent) {
        case 'command': {
            // Legacy command handling for explicit commands
            await handleBotCommand(text, user.id, senderPhone, chatId);
            break;
        }

        case 'retrieval': {
            // Smart document/message retrieval with file delivery
            await handleRetrieval(supabaseAdmin, user.id, senderPhone, classified);
            break;
        }

        case 'meeting': {
            // Meeting detection and calendar flow
            await handleMeetingDetection(
                supabaseAdmin,
                user.id,
                senderPhone,
                senderName,
                text,
                messageId,
                chatId,
                userTimezone
            );
            break;
        }

        case 'reminder': {
            // Smart reminder creation (time, conditional, recurring)
            await handleReminderCreation(
                supabaseAdmin,
                user.id,
                senderPhone,
                text,
                chatId,
                messageId,
                userTimezone,
                senderName
            );
            break;
        }

        case 'calendar_query': {
            // Calendar queries — check upcoming events
            try {
                const { getUpcomingEvents, isCalendarConnected } = await import('@/lib/google-calendar');
                const connected = await isCalendarConnected(supabaseAdmin, user.id);
                if (!connected) {
                    await sendTextMessage(senderPhone, '📅 Google Calendar not connected. Visit your dashboard settings to connect it.');
                    break;
                }
                const events = await getUpcomingEvents(supabaseAdmin, user.id, 5);
                if (events.length === 0) {
                    await sendTextMessage(senderPhone, '📅 No upcoming events on your calendar.');
                } else {
                    let msg = `📅 *Upcoming Events:*\n\n`;
                    events.forEach((e, i) => {
                        const start = new Date(e.startTime);
                        msg += `${i + 1}. *${e.title}*\n   🕐 ${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\n`;
                        if (e.link) msg += `   🔗 ${e.link}\n`;
                        msg += '\n';
                    });
                    await sendTextMessage(senderPhone, msg);
                }
            } catch (err) {
                console.error('[Intent] Calendar query error:', err);
                await sendTextMessage(senderPhone, '❌ Could not fetch calendar events. Please try again.');
            }
            break;
        }

        case 'question': {
            // General knowledge question — route through RAG + AI
            await routeToAssistant(text, user.id, senderPhone, chatId);
            break;
        }

        case 'commitment': {
            // Show commitments list (user asking about their commitments)
            const { data: pendingCommitments } = await supabaseAdmin
                .from('commitments')
                .select('text, due_date, priority, committed_by')
                .eq('user_id', user.id)
                .eq('status', 'pending')
                .order('due_date', { ascending: true })
                .limit(10);

            if (!pendingCommitments || pendingCommitments.length === 0) {
                await sendTextMessage(senderPhone, '✅ No pending commitments tracked!');
            } else {
                let msg = `📋 *Pending Commitments (${pendingCommitments.length}):*\n\n`;
                pendingCommitments.forEach((c: any, i: number) => {
                    const priorityIcon = c.priority === 'high' ? '🔴' : c.priority === 'medium' ? '🟡' : '🟢';
                    msg += `${priorityIcon} ${i + 1}. ${c.text}\n`;
                    if (c.due_date) {
                        const isOverdue = new Date(c.due_date) < new Date();
                        msg += `   📅 ${new Date(c.due_date).toLocaleDateString()}${isOverdue ? ' ⚠️ OVERDUE' : ''}\n`;
                    }
                    msg += `   👤 ${c.committed_by === 'me' ? 'You committed' : c.committed_by === 'them' ? 'They committed' : 'Mutual'}\n\n`;
                });
                await sendTextMessage(senderPhone, msg);
            }
            break;
        }

        case 'casual':
        default: {
            // Casual messages — check bot_mode
            const botMode = user.bot_mode || 'active';
            if (botMode === 'active' && text.length >= 5) {
                await routeToAssistant(text, user.id, senderPhone, chatId);
            }
            break;
        }
    }
}

// Background commitment detection (fire-and-forget)
async function detectCommitmentsInBackground(
    userId: string,
    senderPhone: string,
    text: string,
    chatId: string,
    contactId: string | null,
    isFromMe: boolean,
    senderName: string
) {
    await handleCommitmentDetection(
        supabaseAdmin,
        userId,
        senderPhone,
        text,
        chatId,
        contactId,
        isFromMe,
        senderName
    );
}

// ============================================================
// Bot Command Handler (Legacy — kept for explicit /commands)
// ============================================================

function isCommand(text: string): boolean {
    const commands = [
        'summary', 'find', 'search', 'show', 'help', 'remind', 'brief', 'status', 'summarize',
        'ask', 'analytics', 'insights', 'commitments', 'sentiment', 'quiet', 'active',
    ];
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
                                `🔍 *find/search* [keyword] - Search messages\n` +
                                `🧠 *ask* [question] - Ask AI a question\n` +
                                `📝 *summary* last [N] days - Chat summary\n` +
                                `📋 *summarize* [group] or [period] - Enhanced summary\n` +
                                `📎 *show* documents about [topic] - Find files\n` +
                                `👤 *brief* [contact] - Contact briefing\n` +
                                `💡 *insights* [contact] - Relationship analysis\n` +
                                `😊 *sentiment* [contact] - Mood analysis\n` +
                                `📊 *analytics* last [N] days - Key stats\n` +
                                `✅ *commitments* - List pending tasks\n` +
                                `⏰ *remind* [task] by [date] - Create reminder\n` +
                                `📈 *status* - Your Rememora stats\n` +
                                `🔇 *quiet* - Stop auto-replies\n` +
                                `🔊 *active* - Resume auto-replies\n` +
                                `❓ *help* - Show this message\n\n` +
                                `_💬 Or just send any message — I'll respond with AI!_`;
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

          case 'ask': {
                    // Explicit conversational query — route to AI
                    if (!args) {
                                await sendTextMessage(senderPhone, 'Please ask a question. Example: ask what did Neha say about the project?');
                                return;
                    }
                    await routeToAssistant(args, userId, senderPhone, chatId);
                    break;
          }

          case 'analytics': {
                    // Quick analytics summary
                    const periodMatch = args.match(/last\s+(\d+)\s+days?/i);
                    const analyticsDays = periodMatch ? parseInt(periodMatch[1]) : 7;
                    const analyticsFrom = new Date(Date.now() - analyticsDays * 24 * 60 * 60 * 1000).toISOString();

                    const { count: periodMessages } = await supabaseAdmin
                                .from('messages')
                                .select('id', { count: 'exact', head: true })
                                .eq('user_id', userId)
                                .gte('timestamp', analyticsFrom);

                    const { count: activeChatsCount } = await supabaseAdmin
                                .from('chats')
                                .select('id', { count: 'exact', head: true })
                                .eq('user_id', userId)
                                .gte('last_message_at', analyticsFrom);

                    // Top contacts by message count in period
                    const { data: topContactsData } = await supabaseAdmin
                                .from('messages')
                                .select('sender_name')
                                .eq('user_id', userId)
                                .gte('timestamp', analyticsFrom)
                                .not('sender_name', 'is', null);

                    const contactCounts: Record<string, number> = {};
                    (topContactsData || []).forEach((m: any) => {
                                contactCounts[m.sender_name] = (contactCounts[m.sender_name] || 0) + 1;
                    });
                    const topContacts = Object.entries(contactCounts)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 5);

                    let analyticsText = `*Analytics (last ${analyticsDays} days):*\n\n` +
                                `📨 Messages: ${periodMessages || 0}\n` +
                                `💬 Active Chats: ${activeChatsCount || 0}\n`;

                    if (topContacts.length > 0) {
                                analyticsText += `\n*Top Contacts:*\n`;
                                topContacts.forEach(([name, count], i) => {
                                              analyticsText += `${i + 1}. ${name} (${count} msgs)\n`;
                                });
                    }
                    await sendTextMessage(senderPhone, analyticsText);
                    break;
          }

          case 'insights': {
                    if (!args) {
                                await sendTextMessage(senderPhone, 'Please specify a contact. Example: insights Neha');
                                return;
                    }

                    // Find contact
                    const { data: insightContacts } = await supabaseAdmin
                                .from('contacts')
                                .select('id, display_name, wa_id')
                                .eq('user_id', userId)
                                .ilike('display_name', `%${args}%`)
                                .limit(1);

                    if (!insightContacts || insightContacts.length === 0) {
                                await sendTextMessage(senderPhone, `No contact found matching "${args}"`);
                                return;
                    }

                    const insightContact = insightContacts[0];

                    // Get message count and date range
                    const { count: msgCount } = await supabaseAdmin
                                .from('messages')
                                .select('id', { count: 'exact', head: true })
                                .eq('user_id', userId)
                                .eq('contact_id', insightContact.id);

                    const { data: firstMsg } = await supabaseAdmin
                                .from('messages')
                                .select('timestamp')
                                .eq('user_id', userId)
                                .eq('contact_id', insightContact.id)
                                .order('timestamp', { ascending: true })
                                .limit(1);

                    const { data: lastMsg } = await supabaseAdmin
                                .from('messages')
                                .select('timestamp')
                                .eq('user_id', userId)
                                .eq('contact_id', insightContact.id)
                                .order('timestamp', { ascending: false })
                                .limit(1);

                    let insightText = `*Insights: ${insightContact.display_name}*\n\n` +
                                `📊 Total Messages: ${msgCount || 0}\n`;

                    if (firstMsg && firstMsg.length > 0) {
                                insightText += `📅 First Message: ${new Date(firstMsg[0].timestamp).toLocaleDateString()}\n`;
                    }
                    if (lastMsg && lastMsg.length > 0) {
                                insightText += `🕐 Last Active: ${new Date(lastMsg[0].timestamp).toLocaleDateString()}\n`;
                    }

                    // Recent activity (last 7 days)
                    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                    const { count: recentCount } = await supabaseAdmin
                                .from('messages')
                                .select('id', { count: 'exact', head: true })
                                .eq('user_id', userId)
                                .eq('contact_id', insightContact.id)
                                .gte('timestamp', weekAgo);

                    insightText += `📈 Messages (7d): ${recentCount || 0}`;

                    await sendTextMessage(senderPhone, insightText);
                    break;
          }

          case 'commitments': {
                    // List pending commitments/reminders
                    const { data: pendingItems } = await supabaseAdmin
                                .from('reminders')
                                .select('text, due_at, status')
                                .eq('user_id', userId)
                                .eq('status', 'pending')
                                .order('due_at', { ascending: true })
                                .limit(10);

                    if (!pendingItems || pendingItems.length === 0) {
                                await sendTextMessage(senderPhone, '✅ No pending commitments or reminders!');
                                return;
                    }

                    let commitText = `*Pending Commitments (${pendingItems.length}):*\n\n`;
                    pendingItems.forEach((item: any, i: number) => {
                                const due = new Date(item.due_at);
                                const isOverdue = due < new Date();
                                commitText += `${isOverdue ? '🔴' : '🔵'} ${i + 1}. ${item.text}\n   Due: ${due.toLocaleDateString()}${isOverdue ? ' (OVERDUE)' : ''}\n\n`;
                    });

                    await sendTextMessage(senderPhone, commitText);
                    break;
          }

          case 'sentiment': {
                    if (!args) {
                                await sendTextMessage(senderPhone, 'Please specify a contact. Example: sentiment Neha');
                                return;
                    }

                    // Route to AI for sentiment analysis
                    const sentimentQuery = `Analyze the overall mood and sentiment of my conversations with ${args}. What topics do we discuss most? Is the tone generally positive, neutral, or negative?`;
                    await routeToAssistant(sentimentQuery, userId, senderPhone, chatId);
                    break;
          }

          case 'quiet': {
                    // Set bot mode to quiet
                    await supabaseAdmin
                                .from('users')
                                .update({ bot_mode: 'quiet' })
                                .eq('id', userId);
                    await sendTextMessage(senderPhone, '🔇 Quiet mode ON. I\'ll only respond to explicit commands. Type *active* to resume auto-replies.');
                    break;
          }

          case 'active': {
                    // Set bot mode to active
                    await supabaseAdmin
                                .from('users')
                                .update({ bot_mode: 'active' })
                                .eq('id', userId);
                    await sendTextMessage(senderPhone, '🔊 Active mode ON. I\'ll respond to all your messages with AI assistance. Type *quiet* to stop auto-replies.');
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
// Conversational AI Handler
// Routes non-command messages to AI when bot_mode is 'active'
// ============================================================

async function handleConversationalAI(
    text: string,
    user: any,
    senderPhone: string,
    chatId: string
) {
    // Check bot_mode — default to 'active' if column doesn't exist yet
    const botMode = user.bot_mode || 'active';
    if (botMode !== 'active') return;

    // Don't respond to very short messages (greetings like "hi" etc.)
    if (text.length < 5) return;

    try {
        await routeToAssistant(text, user.id, senderPhone, chatId);
    } catch (err) {
        console.error('[Bot] Conversational AI error:', err);
        // Silently fail — don't spam users with error messages for auto-replies
    }
}

async function routeToAssistant(
    query: string,
    userId: string,
    senderPhone: string,
    chatId: string
) {
    const { hybridSearch } = await import('@/lib/embeddings');

    // Step 1: Search for relevant context
    const searchResults = await hybridSearch({
        userId,
        query,
        matchCount: 6,
        chatId,
    });

    // Step 2: Build context from results
    const contextParts = searchResults.map((r: any, i: number) => {
        const parts = [`[${i + 1}]`, r.chunk_text || ''];
        if (r.metadata?.sender_name) parts.push(`From: ${r.metadata.sender_name}`);
        if (r.metadata?.timestamp) {
            try {
                parts.push(`Date: ${new Date(r.metadata.timestamp).toLocaleDateString()}`);
            } catch { /* skip */ }
        }
        return parts.join(' | ');
    });

    const context = contextParts.length > 0
        ? `Relevant WhatsApp messages:\n\n${contextParts.join('\n\n')}`
        : 'No relevant messages found.';

    // Step 3: Call LLM with WhatsApp-optimized prompt
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY!,
        baseURL: 'https://openrouter.ai/api/v1',
    });

    const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';

    const completion = await openai.chat.completions.create({
        model: LLM_MODEL,
        messages: [
            {
                role: 'system',
                content: `You are Rememora, a WhatsApp AI assistant that helps users search and recall their message history.
You are responding via WhatsApp, so keep answers concise (under 300 words). Use WhatsApp formatting: *bold*, _italic_, ~strikethrough~.
Answer based on the provided context. If context doesn't answer the question, say so honestly.
Reference specific messages by sender name and date when available.
Be friendly, brief, and helpful.`,
            },
            {
                role: 'user',
                content: `${context}\n\n---\n\nUser query: ${query}`,
            },
        ],
        temperature: 0.7,
        max_tokens: 512,
    });

    let reply = completion.choices[0]?.message?.content || 'Sorry, I couldn\'t generate a response.';

    // Format for WhatsApp: truncate if too long
    if (reply.length > 4000) {
        reply = reply.substring(0, 3950) + '\n\n...truncated. View full results on the dashboard.';
    }

    await sendTextMessage(senderPhone, reply);
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
