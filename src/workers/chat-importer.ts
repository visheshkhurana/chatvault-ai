import { supabaseAdmin } from '../lib/supabase';
import { storeEmbeddings } from '../lib/embeddings';

// ============================================================
// WhatsApp Chat History Importer
// Parses exported .txt files from WhatsApp's "Export Chat" feature
// Run via: npm run import:chat -- --file=path/to/chat.txt --userId=xxx
// ============================================================

// WhatsApp export format varies by platform:
// Android: "DD/MM/YYYY, HH:MM - Sender: Message"
// iOS: "[DD/MM/YYYY, HH:MM:SS] Sender: Message"

const MESSAGE_PATTERNS = [
    // Android format
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s*[-\u2013]\s*(.+?):\s(.+)$/,
    // iOS format
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]\s*(.+?):\s(.+)$/,
    // Alternative format
    /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*[-\u2013]\s*(.+?):\s(.+)$/,
  ];

interface ParsedMessage {
    date: string;
    time: string;
    sender: string;
    text: string;
    timestamp: Date;
    isSystem: boolean;
}

// --- Parse a single line ---

function parseLine(line: string): ParsedMessage | null {
    for (const pattern of MESSAGE_PATTERNS) {
          const match = line.match(pattern);
          if (match) {
                  const [, date, time, sender, text] = match;
                  const timestamp = parseTimestamp(date, time);
                  const isSystem = text.includes('<Media omitted>') ||
                            text.includes('Messages and calls are end-to-end encrypted') ||
                            sender.includes('changed the') ||
                            sender.includes('created group');

            return { date, time, sender: sender.trim(), text: text.trim(), timestamp, isSystem };
          }
    }
    return null;
}

function parseTimestamp(date: string, time: string): Date {
    // Handle various date formats
  const parts = date.split(/[\/\-\.]/);
    let day: number, month: number, year: number;

  if (parts[2].length === 4) {
        // DD/MM/YYYY
      day = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        year = parseInt(parts[2]);
  } else if (parts[2].length === 2) {
        // DD/MM/YY
      day = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        year = 2000 + parseInt(parts[2]);
  } else {
        day = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        year = parseInt(parts[2]);
  }

  const timeParts = time.trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?/);
    let hours = parseInt(timeParts?.[1] || '0');
    const minutes = parseInt(timeParts?.[2] || '0');
    const seconds = parseInt(timeParts?.[3] || '0');
    const ampm = timeParts?.[4]?.toLowerCase();

  if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

  return new Date(year, month, day, hours, minutes, seconds);
}

// --- Parse entire chat file ---

function parseWhatsAppExport(content: string): ParsedMessage[] {
    const lines = content.split('\n');
    const messages: ParsedMessage[] = [];
    let currentMessage: ParsedMessage | null = null;

  for (const line of lines) {
        const parsed = parseLine(line);

      if (parsed) {
              if (currentMessage) {
                        messages.push(currentMessage);
              }
              currentMessage = parsed;
      } else if (currentMessage && line.trim()) {
              // Multi-line message continuation
          currentMessage.text += '\n' + line.trim();
      }
  }

  if (currentMessage) {
        messages.push(currentMessage);
  }

  return messages.filter((m) => !m.isSystem);
}

// --- Import to database ---

async function importChat(params: {
    userId: string;
    chatTitle: string;
    chatType: 'individual' | 'group';
    fileContent: string;
}) {
    const { userId, chatTitle, chatType, fileContent } = params;

  console.log(`[ChatImporter] Parsing export for "${chatTitle}"...`);
    const messages = parseWhatsAppExport(fileContent);
    console.log(`[ChatImporter] Found ${messages.length} messages`);

  if (messages.length === 0) {
        console.log('[ChatImporter] No messages found in export');
        return;
  }

  // Create chat
  const { data: chat, error: chatError } = await supabaseAdmin
      .from('chats')
      .upsert(
        {
                  user_id: userId,
                  wa_chat_id: `import_${chatTitle.replace(/\s+/g, '_').toLowerCase()}`,
                  chat_type: chatType,
                  title: chatTitle,
                  last_message_at: messages[messages.length - 1].timestamp.toISOString(),
        },
        { onConflict: 'user_id,wa_chat_id' }
            )
      .select()
      .single();

  if (chatError) {
        console.error('[ChatImporter] Error creating chat:', chatError);
        return;
  }

  // Extract unique senders
  const uniqueSenders = [...new Set(messages.map((m) => m.sender))];

  // Create contacts
  const contactMap = new Map<string, string>();
    for (const sender of uniqueSenders) {
          const { data: contact } = await supabaseAdmin
            .from('contacts')
            .upsert(
              {
                          user_id: userId,
                          wa_id: `import_${sender.replace(/\s+/g, '_').toLowerCase()}`,
                          display_name: sender,
              },
              { onConflict: 'user_id,wa_id' }
                    )
            .select()
            .single();

      if (contact) {
              contactMap.set(sender, contact.id);
      }
    }

  // Import messages in batches
  const BATCH_SIZE = 50;
    let imported = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        const rows = batch.map((msg) => ({
                user_id: userId,
                chat_id: chat.id,
                contact_id: contactMap.get(msg.sender) || null,
                wa_message_id: `import_${msg.timestamp.getTime()}_${msg.sender.substring(0, 5)}`,
                sender_name: msg.sender,
                message_type: msg.text.includes('<Media omitted>') ? 'image' : 'text',
                text_content: msg.text,
                is_from_me: false,
                timestamp: msg.timestamp.toISOString(),
        }));

      const { error } = await supabaseAdmin
          .from('messages')
          .upsert(rows, { onConflict: 'user_id,wa_message_id' });

      if (error) {
              console.error(`[ChatImporter] Batch insert error at ${i}:`, error);
      } else {
              imported += batch.length;
              console.log(`[ChatImporter] Imported ${imported}/${messages.length} messages`);
      }
  }

  // Generate embeddings for imported messages
  console.log('[ChatImporter] Generating embeddings...');
    let embedded = 0;

  for (const msg of messages) {
        if (msg.text && msg.text.length > 10 && !msg.text.includes('<Media omitted>')) {
                try {
                          await storeEmbeddings({
                                      userId,
                                      chatId: chat.id,
                                      text: msg.text,
                                      metadata: {
                                                    sender_name: msg.sender,
                                                    timestamp: msg.timestamp.toISOString(),
                                                    chat_title: chatTitle,
                                                    source: 'import',
                                      },
                          });
                          embedded++;
                          if (embedded % 20 === 0) {
                                      console.log(`[ChatImporter] Embedded ${embedded} messages`);
                          }
                } catch (err) {
                          console.error(`[ChatImporter] Embedding error:`, err);
                }
        }
  }

  console.log(`[ChatImporter] Done! Imported ${imported} messages, embedded ${embedded}`);
}

// --- CLI Entry Point ---

async function main() {
    const args = process.argv.slice(2);
    const fileArg = args.find((a) => a.startsWith('--file='));
    const userIdArg = args.find((a) => a.startsWith('--userId='));
    const titleArg = args.find((a) => a.startsWith('--title='));
    const typeArg = args.find((a) => a.startsWith('--type='));

  if (!fileArg || !userIdArg) {
        console.log('Usage: npm run import:chat -- --file=path/to/chat.txt --userId=uuid [--title="Chat Name"] [--type=individual|group]');
        process.exit(1);
  }

  const filePath = fileArg.split('=')[1];
    const userId = userIdArg.split('=')[1];
    const chatTitle = titleArg?.split('=')[1] || 'Imported Chat';
    const chatType = (typeArg?.split('=')[1] as 'individual' | 'group') || 'individual';

  const fs = await import('fs');
    const fileContent = fs.readFileSync(filePath, 'utf-8');

  await importChat({ userId, chatTitle, chatType, fileContent });
}

main().catch(console.error);

export { parseWhatsAppExport, importChat };
