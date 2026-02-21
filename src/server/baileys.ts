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

const app = express();

app.get('/', (_req, res) => {
  res.json({ service: 'chatvault-baileys-bridge', status: connectionStatus, uptime: process.uptime() });
});

app.get('/qr', (_req, res) => {
  if (connectionStatus === 'connected') return res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f0fdf4"><div style="text-align:center"><h1 style="color:#16a34a">Connected to WhatsApp</h1><p>Bridge is running.</p></div></body></html>');
  if (!qrCode) return res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif"><div><h1>Waiting for QR...</h1><script>setTimeout(()=>location.reload(),3000)</script></div></body></html>');
  res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif"><div style="text-align:center"><h1>Scan QR with WhatsApp</h1><p>WhatsApp > Linked Devices > Link a Device</p><img src="' + qrCode + '" style="margin:20px;border:4px solid #3b82f6;border-radius:12px"/><script>setTimeout(()=>location.reload(),20000)</script></div></body></html>');
});

app.get('/health', (_req, res) => {
  res.json({ ok: connectionStatus === 'connected', status: connectionStatus });
});

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
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) { qrCode = await QRCode.toDataURL(qr); logger.info('QR code ready - visit /qr'); }
    if (connection === 'open') { connectionStatus = 'connected'; qrCode = null; logger.info('Connected!'); await ensureOwnerUser(); }
    if (connection === 'close') {
      connectionStatus = 'disconnected';
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) { logger.info('Reconnecting in 5s...'); setTimeout(startBaileys, 5000); }
      else { logger.error('Logged out. Delete auth_state and restart.'); if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true }); }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try { await handleMessage(msg); } catch (err) { logger.error({ err, id: msg.key.id }, 'Message error'); }
    }
  });
}

async function ensureOwnerUser() {
  if (!sock?.user?.id) return;
  const phone = sock.user.id.split(':')[0].split('@')[0];
  const { data } = await supabase.from('users').select('id').eq('phone', phone).single();
  if (!data) {
    await supabase.from('users').insert({ phone, display_name: sock.user?.name || 'Owner' });
    logger.info({ phone }, 'Created owner user');
  }
}

async function handleMessage(msg: proto.IWebMessageInfo) {
  if (!sock || !msg.message) return;
  const remoteJid = msg.key.remoteJid || '';
  if (remoteJid === 'status@broadcast') return;

  const isGroup = remoteJid.endsWith('@g.us');
  const senderJid = isGroup ? (msg.key.participant || '') : remoteJid;
  const senderPhone = senderJid.split('@')[0].split(':')[0];
  const timestamp = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() : new Date().toISOString();
  const contentType = getContentType(msg.message);
  const { text, mediaType, mimeType } = extractContent(msg, contentType);

  logger.info({ from: senderPhone, type: contentType, isGroup }, 'Processing message');

  const contactId = await ensureContact(senderPhone, senderJid);
  const chatId = await ensureChat(remoteJid, isGroup);

  const { data: stored, error } = await supabase.from('messages').insert({
    chat_id: chatId, contact_id: contactId, wa_message_id: msg.key.id || '',
    content: text || '', message_type: mediaType || 'text',
    direction: msg.key.fromMe ? 'outgoing' : 'incoming', timestamp,
    metadata: { is_group: isGroup, content_type: contentType, sender_jid: senderJid },
  }).select('id').single();

  if (error) { logger.error({ error }, 'Store failed'); return; }

  if (mediaType && stored) {
    try {
      const buf = await downloadMediaMessage(msg, 'buffer', {});
      if (buf) await storeAttachment(stored.id, buf as Buffer, mediaType, mimeType || 'application/octet-stream');
    } catch (err) { logger.error({ err }, 'Media download failed'); }
  }

  if (text && text.length > 10 && stored) {
    try { await generateEmbedding(stored.id, text); } catch {}
  }
}

function extractContent(msg: proto.IWebMessageInfo, ct: string | undefined) {
  const m = msg.message!;
  switch (ct) {
    case 'conversation': return { text: m.conversation || '', mediaType: null, mimeType: null };
    case 'extendedTextMessage': return { text: m.extendedTextMessage?.text || '', mediaType: null, mimeType: null };
    case 'imageMessage': return { text: m.imageMessage?.caption || '', mediaType: 'image', mimeType: m.imageMessage?.mimetype || null };
    case 'videoMessage': return { text: m.videoMessage?.caption || '', mediaType: 'video', mimeType: m.videoMessage?.mimetype || null };
    case 'audioMessage': return { text: '', mediaType: 'audio', mimeType: m.audioMessage?.mimetype || null };
    case 'documentMessage': return { text: m.documentMessage?.fileName || '', mediaType: 'document', mimeType: m.documentMessage?.mimetype || null };
    case 'stickerMessage': return { text: '', mediaType: 'sticker', mimeType: 'image/webp' };
    case 'locationMessage': return { text: 'Location: ' + m.locationMessage?.degreesLatitude + ',' + m.locationMessage?.degreesLongitude, mediaType: 'location', mimeType: null };
    case 'contactMessage': return { text: m.contactMessage?.displayName || 'Contact', mediaType: 'contact', mimeType: null };
    default: return { text: '', mediaType: null, mimeType: null };
  }
}

async function ensureContact(phone: string, jid: string): Promise<string> {
  const { data } = await supabase.from('contacts').select('id').eq('phone', phone).single();
  if (data) return data.id;
  const { data: c, error } = await supabase.from('contacts').insert({ phone, display_name: phone, wa_id: jid }).select('id').single();
  if (error) { const { data: r } = await supabase.from('contacts').select('id').eq('phone', phone).single(); return r?.id || 'unknown'; }
  return c.id;
}

async function ensureChat(jid: string, isGroup: boolean): Promise<string> {
  const { data } = await supabase.from('chats').select('id').eq('wa_chat_id', jid).single();
  if (data) return data.id;
  let name = jid.split('@')[0];
  if (isGroup && sock) { try { name = (await sock.groupMetadata(jid)).subject || name; } catch {} }
  const { data: c, error } = await supabase.from('chats').insert({ wa_chat_id: jid, name, is_group: isGroup }).select('id').single();
  if (error) { const { data: r } = await supabase.from('chats').select('id').eq('wa_chat_id', jid).single(); return r?.id || 'unknown'; }
  return c.id;
}

async function storeAttachment(msgId: string, buf: Buffer, type: string, mime: string) {
  const ext = mime.split('/')[1]?.split(';')[0] || 'bin';
  const path = 'attachments/' + new Date().toISOString().split('T')[0] + '/' + msgId + '.' + ext;
  await supabase.storage.from('attachments').upload(path, buf, { contentType: mime });
  await supabase.from('attachments').insert({ message_id: msgId, file_type: type, mime_type: mime, file_size: buf.length, storage_path: path });
}

async function generateEmbedding(msgId: string, text: string) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return;
  const model = process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small';
  const r = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: text.substring(0, 8000) }),
  });
  const d = await r.json();
  const emb = d?.data?.[0]?.embedding;
  if (emb) await supabase.from('embeddings').insert({ message_id: msgId, content: text.substring(0, 8000), embedding: JSON.stringify(emb) });
}

async function main() {
  logger.info('=== ChatVault Baileys Bridge ===');
  app.listen(PORT, '0.0.0.0', () => logger.info('Server on port ' + PORT + ' - QR at /qr'));
  await startBaileys();
}

main().catch(err => { logger.error({ err }, 'Fatal'); process.exit(1); });
