import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    WASocket,
    proto,
    downloadMediaMessage,
    getContentType,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import fs from 'fs';
import pino from 'pino';

// ================================================================
// ChatVault AI - Baileys WhatsApp Bridge
// ================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PORT = parseInt(process.env.PORT || '3001');
const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || './auth_state';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let sock: WASocket | null = null;
let qrCode: string | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
let ownerUserId: string | null = null;
let syncStats = { chats: 0, messages: 0, contacts: 0, startedAt: null as Date | null, completedAt: null as Date | null, inProgress: false, errors: 0 };

const app = express();
app.use(cors());

app.get('/', (_req, res) => {
    res.json({ service: 'chatvault-baileys-bridge', status: connectionStatus, uptime: process.uptime() });
});

app.get('/qr', (_req, res) => {
    if (connectionStatus === 'connected')
          return res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f0fdf4"><div style="text-align:center"><h1 style="color:#16a34a">Connected to WhatsApp</h1><p>Bridge is running.</p></div></body></html>');
    if (!qrCode)
          return res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif"><div><h1>Waiting for QR...</h1><script>setTimeout(()=>location.reload(),3000)</script></div></body></html>');
    res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif"><div style="text-align:center"><h1>Scan QR with WhatsApp</h1><p>WhatsApp > Linked Devices > Link a Device</p><img src="' + qrCode + '" style="margin:20px;border:4px solid #3b82f6;border-radius:12px"/><script>setTimeout(()=>location.reload(),20000)</script></div></body></html>');
});

app.get('/sync', (_req, res) => {
    res.json({ ...syncStats, connectionStatus });
});

app.get('/health', (_req, res) => {
    res.json({ ok: connectionStatus === 'connected', status: connectionStatus });
});

// ================================================================
// Owner user
// ================================================================

async function ensureOwnerUser(): Promise<string> {
    if (ownerUserId) return ownerUserId;
    if (!sock?.user?.id) throw new Error('No socket user');

  const phoneNumber = sock.user.id.split(':')[0].split('@')[0];

  // Look up existing user by phone
  const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phoneNumber)
      .maybeSingle();

  if (users?.id) {
        ownerUserId = users.id;
        return ownerUserId!;
  }

// No user exists – create one. Look up auth user first.
        const { data: authUsers } = await supabase.auth.admin.listUsers();
        const authUser = authUsers?.users?.[0];
        if (!authUser) throw new Error('No auth user found in system');

        const { data: newUser, error } = await supabase
            .from('users')
            .insert({
                            auth_id: authUser.id,
                            phone: phoneNumber,
                            display_name: sock.user?.name || 'WhatsApp User',
                            email: authUser.email,
            })
            .select('id')
            .single();

  if (error) {
        logger.error({ error }, 'Failed to create owner user');
        throw error;
  }
    ownerUserId = newUser.id;
    return ownerUserId!;
}

// ================================================================
// Baileys connection
// ================================================================

async function startBaileys() {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    connectionStatus = 'connecting';
    logger.info('Starting Baileys connection...');

  sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ['ChatVault AI', 'Chrome', '120.0'],
        syncFullHistory: true,
  });

  sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
                qrCode = await QRCode.toDataURL(qr);
                logger.info('QR code ready - visit /qr');
        }
        if (connection === 'open') {
                connectionStatus = 'connected';
                qrCode = null;
                logger.info('Connected!');
                try { await ensureOwnerUser(); } catch (err) { logger.error({ err }, 'ensureOwnerUser failed'); }
        }
        if (connection === 'close') {
                connectionStatus = 'disconnected';
                const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
                if (code !== DisconnectReason.loggedOut) {
                          logger.info('Reconnecting in 5s...');
                          setTimeout(startBaileys, 5000);
                } else {
                          logger.error('Logged out. Delete auth_state and restart.');
                          if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true });
                }
        }
  });

  sock.ev.on('creds.update', saveCreds);

    // Handle full history set events (contacts, chats, messages in bulk)
    sock.ev.on('messaging-history.set', async ({ chats: histChats, contacts: histContacts, messages: histMsgs, isLatest }) => {
        logger.info({ chats: histChats.length, contacts: histContacts.length, messages: histMsgs.length, isLatest }, 'History set received');
        syncStats.inProgress = true;
        if (!syncStats.startedAt) syncStats.startedAt = new Date();

        try {
            const userId = await ensureOwnerUser();

            // Process contacts
            for (const c of histContacts) {
                try {
                    const cId = c.id || '';
                    const phone = cId.split('@')[0].split(':')[0];
                    if (phone && cId) {
                        await ensureContact(userId, phone, cId);
                        syncStats.contacts++;
                    }
                } catch {}
            }

            // Process chats
            for (const ch of histChats) {
                try {
                    const chatJid = ch.id || '';
                    if (chatJid && chatJid !== 'status@broadcast') {
                        const isGroup = chatJid.endsWith('@g.us');
                        await ensureChat(userId, chatJid, isGroup);
                        syncStats.chats++;
                    }
                } catch {}
            }

            // Process historical messages
            for (const msg of histMsgs) {
                try {
                    await handleMessage(msg, true);
                    syncStats.messages++;
                } catch (err) {
                    syncStats.errors++;
                }
            }

            if (isLatest) {
                syncStats.completedAt = new Date();
                syncStats.inProgress = false;
                logger.info(syncStats, 'History sync complete!');
            }
        } catch (err) {
            logger.error({ err }, 'History set processing error');
        }
    });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
        const isHistory = type === 'append';
        if (type !== 'notify' && type !== 'append') return;
        if (isHistory) {
            syncStats.inProgress = true;
            if (!syncStats.startedAt) syncStats.startedAt = new Date();
            logger.info({ count: messages.length }, 'History sync batch received');
        }
        for (const msg of messages) {
                try {
                          await handleMessage(msg, isHistory);
                } catch (err) {
                          logger.error({ err, id: msg.key.id }, 'Message error');
                }
        }
  });
}

// ================================================================
// Message handling
// ================================================================

async function handleMessage(msg: proto.IWebMessageInfo, isHistory = false) {
    if (!sock || !msg.message) return;
    const remoteJid = msg.key.remoteJid || '';
    if (remoteJid === 'status@broadcast') return;

  const userId = await ensureOwnerUser();
    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = isGroup ? (msg.key.participant || '') : remoteJid;
    const senderPhone = senderJid.split('@')[0].split(':')[0];
    const timestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();

  const contentType = getContentType(msg.message);
    const { text, mediaType, mimeType } = extractContent(msg, contentType);

  logger.info({ from: senderPhone, type: contentType, isGroup }, 'Processing message');

  const contactId = await ensureContact(userId, senderPhone, senderJid);
    const chatId = await ensureChat(userId, remoteJid, isGroup);

  // Insert message - columns must match DB schema exactly
  const { data: stored, error } = await supabase
      .from('messages')
      .insert({
              user_id: userId,
              chat_id: chatId,
              contact_id: contactId,
              wa_message_id: msg.key.id || '',
              sender_phone: senderPhone,
                          message_type: contentType || 'text',
              sender_name: msg.pushName || senderPhone,
              text_content: text || '',
              is_from_me: msg.key.fromMe || false,
              is_forwarded: false,
              raw_payload: { content_type: contentType, media_type: mediaType, is_group: isGroup, sender_jid: senderJid },
              timestamp,
      })
      .select('id')
      .single();

  if (error) {
        if (isHistory && error.code === '23505') return; // skip duplicates during history sync
        logger.error({ error }, 'Store failed');
        return;
    }

  // Handle media attachments
  if (mediaType && stored && !isHistory) {
        try {
                const buf = await downloadMediaMessage(msg, 'buffer', {});
                if (buf) await storeAttachment(userId, stored.id, chatId, buf as Buffer, mediaType, mimeType || 'application/octet-stream');
        } catch (err) {
                logger.error({ err }, 'Media download failed');
        }
  }

  // Generate embeddings for text
  if (text && text.length > 10 && stored && !isHistory) {
        try {
                await generateEmbedding(userId, chatId, stored.id, text);
        } catch {}
  }
}

// ================================================================
// Content extraction
// ================================================================

function extractContent(msg: proto.IWebMessageInfo, ct: string | undefined) {
    const m = msg.message!;
    switch (ct) {
      case 'conversation':
              return { text: m.conversation || '', mediaType: null, mimeType: null };
      case 'extendedTextMessage':
              return { text: m.extendedTextMessage?.text || '', mediaType: null, mimeType: null };
      case 'imageMessage':
              return { text: m.imageMessage?.caption || '', mediaType: 'image', mimeType: m.imageMessage?.mimetype || null };
      case 'videoMessage':
              return { text: m.videoMessage?.caption || '', mediaType: 'video', mimeType: m.videoMessage?.mimetype || null };
      case 'audioMessage':
              return { text: '', mediaType: 'audio', mimeType: m.audioMessage?.mimetype || null };
      case 'documentMessage':
              return { text: m.documentMessage?.fileName || '', mediaType: 'document', mimeType: m.documentMessage?.mimetype || null };
      case 'stickerMessage':
              return { text: '', mediaType: 'sticker', mimeType: 'image/webp' };
      case 'locationMessage':
              return { text: 'Location: ' + m.locationMessage?.degreesLatitude + ',' + m.locationMessage?.degreesLongitude, mediaType: 'location', mimeType: null };
      case 'contactMessage':
              return { text: m.contactMessage?.displayName || 'Contact', mediaType: 'contact', mimeType: null };
      default:
              return { text: '', mediaType: null, mimeType: null };
    }
}

// ================================================================
// Contact & Chat helpers
// ================================================================

async function ensureContact(userId: string, phone: string, jid: string): Promise<string> {
    const { data } = await supabase.from('contacts').select('id').eq('wa_id', jid).eq('user_id', userId).maybeSingle();
    if (data) return data.id;

  const { data: c, error } = await supabase
      .from('contacts')
      .insert({ user_id: userId, wa_id: jid, display_name: phone })
      .select('id')
      .single();

  if (error) {
        // Race condition - try to fetch again
      const { data: r } = await supabase.from('contacts').select('id').eq('wa_id', jid).eq('user_id', userId).maybeSingle();
        return r?.id || 'unknown';
  }
    return c.id;
}

async function ensureChat(userId: string, jid: string, isGroup: boolean): Promise<string> {
    const { data } = await supabase.from('chats').select('id').eq('wa_chat_id', jid).eq('user_id', userId).maybeSingle();
    if (data) return data.id;

  let chatTitle = jid.split('@')[0];
    if (isGroup && sock) {
          try {
                  chatTitle = (await sock.groupMetadata(jid)).subject || chatTitle;
          } catch {}
    }

  const { data: c, error } = await supabase
      .from('chats')
      .insert({
              user_id: userId,
              wa_chat_id: jid,
              chat_type: isGroup ? 'group' : 'individual',
              title: chatTitle,
      })
      .select('id')
      .single();

  if (error) {
        const { data: r } = await supabase.from('chats').select('id').eq('wa_chat_id', jid).eq('user_id', userId).maybeSingle();
        return r?.id || 'unknown';
  }
    return c.id;
}

// ================================================================
// Attachments
// ================================================================

async function storeAttachment(userId: string, msgId: string, chatId: string, buf: Buffer, type: string, mime: string) {
    const ext = mime.split('/')[1]?.split(';')[0] || 'bin';
    const key = 'attachments/' + new Date().toISOString().split('T')[0] + '/' + msgId + '.' + ext;

  const { error: uploadErr } = await supabase.storage.from('attachments').upload(key, buf, { contentType: mime });
    if (uploadErr) {
          logger.error({ uploadErr }, 'Upload failed');
          return;
    }

  const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(key);

  await supabase.from('attachments').insert({
        user_id: userId,
        message_id: msgId,
        file_type: type,
        mime_type: mime,
        file_size_bytes: buf.length,
        storage_key: key,
        storage_url: urlData?.publicUrl || key,
  });
}

// ================================================================
// Embeddings
// ================================================================

async function generateEmbedding(userId: string, chatId: string, msgId: string, text: string) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) return;
    const model = process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small';

  const r = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: text.substring(0, 8000) }),
  });
    const d = await r.json();
    const emb = d?.data?.[0]?.embedding;
    if (emb) {
          await supabase.from('embeddings').insert({
                  user_id: userId,
                  message_id: msgId,
                  chat_id: chatId,
                  chunk_index: 0,
                  chunk_text: text.substring(0, 8000),
                  embedding: JSON.stringify(emb),
          });
    }
}

// ================================================================
// Main
// ================================================================

async function main() {
    logger.info('=== ChatVault Baileys Bridge ===');
    app.listen(PORT, '0.0.0.0', () => logger.info('Server on port ' + PORT + ' - QR at /qr'));
    await startBaileys();
}

main().catch(err => {
    logger.error({ err }, 'Fatal');
    process.exit(1);
});
