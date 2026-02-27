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
import path from 'path';
import pino from 'pino';

// ================================================================
// Rememora - Baileys WhatsApp Bridge + AI Chatbot
// ================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PORT = parseInt(process.env.PORT || '3001');
const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || './auth_state';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const LLM_MODEL = process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct';
const EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small';

// Bot trigger: users send messages starting with these to talk to the bot
// Or they can message themselves (self-chat) to interact
const BOT_TRIGGERS = ['!', '/rememora', '@rememora', 'rememora'];
const BOT_ENABLED = process.env.BOT_ENABLED !== 'false'; // enabled by default

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let sock: WASocket | null = null;
let qrCode: string | null = null;
let connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
let ownerUserId: string | null = null;
let ownerJid: string | null = null;let ownerLid: string | null = null;

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 300000; // 5 minutes max
let lastEventAt: Date | null = null; // Track last Baileys event for staleness detection
const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes without events = stale

let syncStats = {
    chats: 0,
    messages: 0,
    contacts: 0,
    startedAt: null as Date | null,
    completedAt: null as Date | null,
    inProgress: false,
    errors: 0,
    botQueries: 0,
    botResponses: 0,
};

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://rememora.app,https://chatvault-ai.vercel.app,http://localhost:3000').split(',').map(s => s.trim());
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || '';

const app = express();
app.use(cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (e.g. server-to-server, curl)
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) return callback(null, true);
        callback(null, false);
    },
    methods: ['GET', 'POST'],
    credentials: true,
}));

app.get('/', (_req: any, res: any) => {
    res.json({
        service: 'rememora-baileys-bridge',
        status: connectionStatus,
        uptime: process.uptime(),
        bot: BOT_ENABLED ? 'active' : 'disabled',
    });
});

app.get('/qr', (req: any, res: any) => {
    const embed = req.query.embed === '1';
    if (connectionStatus === 'connected') {
        if (embed) return res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0fdf4"><p style="font-family:sans-serif;color:#16a34a;font-size:18px">Connected</p></body></html>');
        return res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f0fdf4"><div style="text-align:center"><h1 style="color:#16a34a">Connected to WhatsApp</h1><p>Bridge is running.</p></div></body></html>');
    }
    if (!qrCode) {
        if (embed) return res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0"><div class="spinner" style="width:48px;height:48px;border:4px solid #e5e7eb;border-top:4px solid #22c55e;border-radius:50%;animation:spin 1s linear infinite"></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style><script>setTimeout(()=>location.reload(),3000)<\/script></body></html>');
        return res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif"><div><h1>Waiting for QR...</h1><script>setTimeout(()=>location.reload(),3000)<\/script></div></body></html>');
    }
    if (embed) {
        return res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;padding:0"><img src="' + qrCode + '" style="max-width:100%;max-height:100%;border:4px solid #3b82f6;border-radius:12px"/><script>setTimeout(()=>location.reload(),20000)<\/script></body></html>');
    }
    res.send('<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif"><div style="text-align:center"><h1>Scan QR with WhatsApp</h1><p>WhatsApp > Linked Devices > Link a Device</p><img src="' + qrCode + '" style="margin:20px;border:4px solid #3b82f6;border-radius:12px"/><script>setTimeout(()=>location.reload(),20000)<\/script></div></body></html>');
});

app.get('/sync', (_req: any, res: any) => {
    res.json({ ...syncStats, connectionStatus });
});

app.get('/health', (_req: any, res: any) => {
    res.json({ ok: connectionStatus === 'connected', status: connectionStatus });
});

app.get('/status', (_req: any, res: any) => {
    res.json({
        connected: connectionStatus === 'connected',
        status: connectionStatus,
        sync: syncStats,
        phone: sock?.user?.id?.split(':')[0]?.split('@')[0] || null,
        name: sock?.user?.name || null,
        lastEventAt: lastEventAt?.toISOString() || null,
        staleMs: lastEventAt ? Date.now() - lastEventAt.getTime() : null,
    });
});

app.post('/reset', async (req: any, res: any) => {
        // Require a shared secret for destructive operations
        const authHeader = req.headers['x-bridge-secret'] || req.query.secret;
        if (BRIDGE_SECRET && authHeader !== BRIDGE_SECRET) {
            return res.status(401).json({ error: 'Unauthorized — provide x-bridge-secret header' });
        }
        logger.info('Reset requested - clearing auth state');
        try {
                    // Close existing connection
                    if (sock) {
                                    sock.end(undefined);
                                    sock = null;
                    }
                    connectionStatus = 'disconnected';
                    qrCode = null;
                    ownerUserId = null;
                    ownerJid = null;
                    // Clear local auth
                    if (fs.existsSync(AUTH_DIR)) {
                                    fs.rmSync(AUTH_DIR, { recursive: true });
                    }
                    // Clear Supabase auth bucket
                    try {
                                    const { data: files } = await supabase.storage.from(AUTH_BUCKET).list('', { limit: 200 });
                                    if (files && files.length > 0) {
                                                        const paths = files.map((f: any) => f.name);
                                                        await supabase.storage.from(AUTH_BUCKET).remove(paths);
                                                        logger.info({ count: paths.length }, 'Cleared auth files from Supabase');
                                    }
                    } catch (err) {
                                    logger.error({ err }, 'Failed to clear Supabase auth');
                    }
                    // Restart connection (will show QR)
                    setTimeout(startBaileys, 1000);
                    res.json({ ok: true, message: 'Auth cleared, reconnecting...' });
        } catch (err) {
                    logger.error({ err }, 'Reset failed');
                    res.status(500).json({ ok: false, error: 'Reset failed' });
        }
});

// ================================================================
// Soft Reconnect — restart socket without clearing auth
// ================================================================

app.post('/reconnect', async (req: any, res: any) => {
    const authHeader = req.headers['x-bridge-secret'] || req.query.secret;
    if (BRIDGE_SECRET && authHeader !== BRIDGE_SECRET) {
        return res.status(401).json({ error: 'Unauthorized — provide x-bridge-secret header' });
    }
    logger.info('Soft reconnect requested');
    try {
        if (sock) {
            sock.end(undefined);
            sock = null;
        }
        connectionStatus = 'disconnected';
        reconnectAttempts = 0;
        // Restart without clearing auth — will use existing credentials
        setTimeout(startBaileys, 1000);
        res.json({ ok: true, message: 'Reconnecting with existing auth...' });
    } catch (err) {
        logger.error({ err }, 'Reconnect failed');
        res.status(500).json({ ok: false, error: 'Reconnect failed' });
    }
});

// ================================================================
// Welcome Message on First Connection
// ================================================================

app.use(express.json());

// ================================================================
// Send endpoint — External callers (cron, dashboard) send via Baileys
// ================================================================

app.post('/send', async (req: any, res: any) => {
    const { phone, message, secret } = req.body;
    if (secret !== process.env.CRON_SECRET && secret !== BRIDGE_SECRET) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    if (!phone || !message) {
        return res.status(400).json({ ok: false, error: 'Missing phone or message' });
    }
    if (!sock || connectionStatus !== 'connected') {
        return res.status(503).json({ ok: false, error: 'WhatsApp not connected' });
    }
    try {
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        res.json({ ok: true });
    } catch (err: any) {
        logger.error({ err }, 'Send message failed');
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/send-welcome', async (_req: any, res: any) => {
        logger.info('Force send-welcome requested');
        if (!sock || connectionStatus !== 'connected') {
                    return res.status(400).json({ ok: false, error: 'WhatsApp not connected' });
        }
        try {
                    const userId = await ensureOwnerUser();
                    if (!userId || !ownerJid) {
                                    return res.status(400).json({ ok: false, error: 'No owner user found' });
                    }
                    // Reset welcome_sent flag so sendWelcomeMessage will actually send
                    await supabase
                        .from('users')
                        .update({ metadata: {} })
                        .eq('id', userId);
                    logger.info('Cleared welcome_sent flag');
                    // Now send welcome
                    await sendWelcomeMessage();
                    res.json({ ok: true, message: 'Welcome message sent!' });
        } catch (err) {
                    logger.error({ err }, 'Force send-welcome failed');
                    res.status(500).json({ ok: false, error: 'Failed to send welcome message' });
        }
});

async function sendWelcomeMessage() {
    if (!sock || !BOT_ENABLED) return;

    try {
        const userId = await ensureOwnerUser();
        if (!userId || !ownerJid) return;

        // Check if welcome message was already sent (stored in Supabase)
        const { data: existing } = await supabase
            .from('users')
            .select('metadata')
            .eq('id', userId)
            .maybeSingle();

        const metadata = existing?.metadata || {};
        if (metadata.welcome_sent) {
            logger.info('Welcome message already sent previously, skipping');
            return;
        }

        // Small delay to let connection stabilize
        await new Promise(r => setTimeout(r, 3000));

        const welcomeText = '\ud83d\udc4b *Welcome to Rememora!*\n\n' +
            'Your WhatsApp memory layer is now active. I\'m your AI assistant that helps you find, organize, and recall anything from your WhatsApp conversations.\n\n' +
            '\ud83d\udcac *What I can do:*\n\n' +
            '\ud83d\udd0d *Find anything* \u2014 Search messages, files & documents\n' +
            '   \u2022 "Find my medical report from March"\n' +
            '   \u2022 "What PDF did Neha send last week?"\n\n' +
            '\ud83d\udcdd *Summarize conversations* \u2014 Get quick recaps\n' +
            '   \u2022 "Summarize my chat with the bankers"\n' +
            '   \u2022 "Recap my conversation with Mom"\n\n' +
            '\u2705 *Track commitments* \u2014 Never miss a promise\n' +
            '   \u2022 "Show my pending commitments"\n' +
            '   \u2022 "What did I promise to do?"\n\n' +
            '\ud83d\udcc4 *Locate documents* \u2014 Find shared files instantly\n' +
            '   \u2022 "Find the invoice from OROS"\n' +
            '   \u2022 "Show documents from last month"\n\n' +
            '\ud83d\udca1 *How to use me:*\n' +
            '\u2022 *Self-chat:* Message yourself \u2014 every message is a query\n' +
            '\u2022 *Any chat:* Prefix with *!* or *@rememora*\n' +
            '   Example: !find my passport copy\n\n' +
            '\ud83d\ude80 I\'m now syncing your WhatsApp history in the background. The more messages I index, the smarter I get!\n\n' +
            'Type *help* anytime to see this again.';

        // Send to self-chat (user's own JID)
        const selfJid = ownerJid.includes(':')
            ? ownerJid.split(':')[0] + '@s.whatsapp.net'
            : ownerJid;

        await sock.sendMessage(selfJid, { text: welcomeText });
        logger.info({ selfJid, ownerJid }, 'Welcome message sent to self-chat');

        // Mark welcome as sent so we don't send again on reconnect
        await supabase
            .from('users')
            .update({ metadata: { ...metadata, welcome_sent: true, welcome_sent_at: new Date().toISOString() } })
            .eq('id', userId);

        logger.info('Welcome sent flag stored in user metadata');
    } catch (err) {
        logger.error({ err }, 'Failed to send welcome message');
    }
}

// ================================================================
// Owner user
// ================================================================

async function ensureOwnerUser(): Promise<string> {
    if (ownerUserId) return ownerUserId;
    if (!sock?.user?.id) throw new Error('No socket user');

    const phoneNumber = sock.user.id.split(':')[0].split('@')[0];
    ownerJid = sock.user.id;
    // Capture LID for multi-device self-chat detection
    try {
      const lidUser = sock?.user?.lid;
      if (lidUser) {
        ownerLid = lidUser.split(':')[0] + '@lid';
        logger.info({ ownerLid }, 'Captured owner LID');
      }
    } catch (e) { /* lid not available */ }

    const { data: users } = await supabase.from('users').select('id').eq('phone', phoneNumber).maybeSingle();
    if (users?.id) {
        ownerUserId = users.id;
        return ownerUserId!;
    }

    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find((u: any) =>
        u.phone === phoneNumber || u.user_metadata?.phone === phoneNumber
    ) || authUsers?.users?.[0];

    if (!authUser) throw new Error('No auth user found in system');

    const { data: newUser, error } = await supabase.from('users').insert({
        auth_id: authUser.id,
        phone: phoneNumber,
        display_name: sock.user?.name || 'WhatsApp User',
        email: authUser.email,
    }).select('id').single();

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

const AUTH_BUCKET = 'baileys-auth';

async function ensureAuthBucket() {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find((b: any) => b.name === AUTH_BUCKET)) {
        await supabase.storage.createBucket(AUTH_BUCKET, { public: false });
        logger.info('Created auth bucket');
    }
}

async function restoreAuthFromSupabase(): Promise<boolean> {
    try {
        await ensureAuthBucket();
        const { data: files } = await supabase.storage.from(AUTH_BUCKET).list('', { limit: 100 });
        if (!files || files.length === 0) {
            logger.info('No auth state in Supabase - fresh start');
            return false;
        }
        if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
        for (const file of files) {
            const { data, error } = await supabase.storage.from(AUTH_BUCKET).download(file.name);
            if (data && !error) {
                const buf = Buffer.from(await data.arrayBuffer());
                fs.writeFileSync(path.join(AUTH_DIR, file.name), buf);
            }
        }
        logger.info({ count: files.length }, 'Restored auth state from Supabase');
        return true;
    } catch (err) {
        logger.error({ err }, 'Failed to restore auth from Supabase');
        return false;
    }
}

async function backupAuthToSupabase() {
    try {
        await ensureAuthBucket();
        if (!fs.existsSync(AUTH_DIR)) return;
        const files = fs.readdirSync(AUTH_DIR);
        for (const file of files) {
            const filePath = path.join(AUTH_DIR, file);
            const buf = fs.readFileSync(filePath);
            await supabase.storage.from(AUTH_BUCKET).upload(file, buf, { contentType: 'application/json', upsert: true });
        }
        logger.info({ count: files.length }, 'Backed up auth state to Supabase');
    } catch (err) {
        logger.error({ err }, 'Failed to backup auth to Supabase');
    }
}

// ================================================================
// Keepalive Timer — auto-reconnect if socket goes stale
// ================================================================

let keepaliveInterval: NodeJS.Timeout | null = null;

function startKeepaliveTimer() {
    // Clear any existing timer
    if (keepaliveInterval) clearInterval(keepaliveInterval);

    keepaliveInterval = setInterval(() => {
        if (connectionStatus !== 'connected' || !lastEventAt) return;

        const staleMs = Date.now() - lastEventAt.getTime();
        if (staleMs > STALE_TIMEOUT_MS) {
            logger.warn({ staleMs, lastEventAt: lastEventAt.toISOString(), thresholdMs: STALE_TIMEOUT_MS }, 'Connection appears stale — no events received. Auto-reconnecting...');
            // Soft reconnect: close socket, restart without clearing auth
            if (sock) {
                try { sock.end(undefined); } catch (_) {}
                sock = null;
            }
            connectionStatus = 'disconnected';
            reconnectAttempts = 0;
            lastEventAt = null;
            if (keepaliveInterval) clearInterval(keepaliveInterval);
            keepaliveInterval = null;
            setTimeout(startBaileys, 2000);
        } else {
            logger.debug({ staleMs, lastEventAt: lastEventAt.toISOString() }, 'Keepalive check — connection healthy');
        }
    }, 60_000); // Check every 60 seconds
}

async function startBaileys() {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    const localFiles = fs.existsSync(AUTH_DIR) ? fs.readdirSync(AUTH_DIR) : [];
    if (localFiles.length === 0) {
        await restoreAuthFromSupabase();
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    connectionStatus = 'connecting';
    logger.info('Starting Baileys connection...');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || 'warn' }),
        
        printQRInTerminal: true,
                browser: ['Ubuntu', 'Chrome', '20.0.04'],
                connectTimeoutMs: 60000,        version: [2, 3000, 1033893291],
        syncFullHistory: true,
    });

    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;        logger.info({ connection, qr: !!qr, lastDisconnect: lastDisconnect?.error?.message, update: JSON.stringify(update).substring(0, 500) }, 'connection.update event');

        if (qr) {
            qrCode = await QRCode.toDataURL(qr);
            logger.info('QR code ready - visit /qr');
        }

        if (connection === 'open') {
            connectionStatus = 'connected';
            qrCode = null;
            reconnectAttempts = 0; // Reset backoff on successful connection
            lastEventAt = new Date(); // Track connection time
            logger.info('Connected!');
            // Start keepalive: auto-reconnect if no events for STALE_TIMEOUT_MS
            startKeepaliveTimer();
        // Capture LID for multi-device self-chat
        if (sock?.user?.lid) {
          ownerLid = sock.user.lid.split(':')[0] + '@lid';
          logger.info({ ownerLid, ownerJid: sock.user.id }, 'Owner LID captured at connection');
        }
            try {
                await ensureOwnerUser();
                await backupAuthToSupabase();
                // Send welcome message on first-ever connection
                await sendWelcomeMessage();
            } catch (err) {
                logger.error({ err }, 'ensureOwnerUser failed');
            }
        }

        if (connection === 'close') {
            connectionStatus = 'disconnected';
            const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
            if (code !== DisconnectReason.loggedOut) {
                reconnectAttempts++;
                const delay = Math.min(5000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY) + Math.floor(Math.random() * 2000);
                logger.error({ code, error: lastDisconnect?.error?.message || lastDisconnect?.error, attempt: reconnectAttempts, nextRetryMs: delay }, 'Connection closed, reconnecting...');
                setTimeout(startBaileys, delay);
            } else {
                logger.error('Logged out. Delete auth_state and restart.');
                if (fs.existsSync(AUTH_DIR)) fs.rmSync(AUTH_DIR, { recursive: true });
            }
        }
    });

    sock.ev.on('creds.update', async () => {
        await saveCreds();
        await backupAuthToSupabase();
    });

    sock.ev.on('messaging-history.set', async ({ chats: histChats, contacts: histContacts, messages: histMsgs, isLatest }: any) => {
        lastEventAt = new Date(); // Reset staleness timer
        logger.info({ chats: histChats.length, contacts: histContacts.length, messages: histMsgs.length, isLatest }, 'History set received');
        syncStats.inProgress = true;
        if (!syncStats.startedAt) syncStats.startedAt = new Date();

        try {
            const userId = await ensureOwnerUser();

            for (const c of histContacts) {
                try {
                    const cId = c.id || '';
                    const phone = cId.split('@')[0].split(':')[0];
                    if (phone && cId) {
                        await ensureContact(userId, phone, cId);
                        syncStats.contacts++;
                    }
                } catch (err) {
                    logger.warn({ err, contactId: c.id }, 'Failed to process contact during sync');
                }
            }

            for (const ch of histChats) {
                try {
                    const chatJid = ch.id || '';
                    if (chatJid && chatJid !== 'status@broadcast') {
                        const isGroup = chatJid.endsWith('@g.us');
                        await ensureChat(userId, chatJid, isGroup);
                        syncStats.chats++;
                    }
                } catch (err) {
                    logger.warn({ err, chatId: ch.id }, 'Failed to process chat during sync');
                }
            }

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

        sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
        const isHistory = type === 'append';
        if (type !== 'notify' && type !== 'append') return;

        // Debug: log all upsert events for diagnostics
        const ownerPhone = sock?.user?.id?.split(':')[0]?.split('@')[0] || '';
        lastEventAt = new Date(); // Reset staleness timer on every message event
        logger.info({ type, count: messages.length, fromMe: messages[0]?.key?.fromMe, remoteJid: messages[0]?.key?.remoteJid?.split('@')[0]?.substring(0, 6) }, 'messages.upsert event');

        if (isHistory) {
            syncStats.inProgress = true;
            if (!syncStats.startedAt) syncStats.startedAt = new Date();
            logger.info({ count: messages.length }, 'History sync batch received');
        }

        for (const msg of messages) {
            try {
                await handleMessage(msg, isHistory);

                // Chatbot: check if this is a bot query
                // For self-chat (fromMe): always trigger bot regardless of sync state
                // For notify (real-time incoming from others): always trigger
                // For append during active history sync: skip unless it's a recent self-chat
                if (BOT_ENABLED) {
                    const isSelfMsg = msg.key.fromMe && (
                        msg.key.remoteJid === ownerJid ||
                        msg.key.remoteJid?.split('@')[0]?.split(':')[0] === ownerPhone ||
                        (ownerLid && msg.key.remoteJid === ownerLid)
                      );
                    const msgAge = msg.messageTimestamp ? (Date.now() / 1000) - Number(msg.messageTimestamp) : Infinity;
                    const isRecent = msgAge < 120; // within last 2 minutes
                    if (type === 'notify' || (isSelfMsg && isRecent)) {
                        logger.info({ fromMe: msg.key.fromMe, isSelfMsg, type, msgAge: Math.round(msgAge), remoteJid: msg.key.remoteJid, ownerLid, ownerJid }, 'Triggering bot check');
                        await maybeHandleBotQuery(msg);
                    }
                }
            } catch (err) {
                logger.error({ err, id: msg.key.id }, 'Message error');
            }
        }
    });

    // Catch self-chat messages that may not arrive via messages.upsert in multi-device mode
    sock.ev.on('messages.update', async (updates: any[]) => {
        if (!BOT_ENABLED || !sock) return;
        const ownerPhone = sock?.user?.id?.split(':')[0]?.split('@')[0] || '';
        for (const update of updates) {
            try {
                const { key, update: msgUpdate } = update;
                // Only care about self-chat messages
                const isSelf = key.fromMe && (
                    key.remoteJid === ownerJid ||
                    key.remoteJid?.split('@')[0]?.split(':')[0] === ownerPhone ||
                    (ownerLid && key.remoteJid === ownerLid)
                  );
                if (!isSelf) continue;
                // If message content is available in the update, process it
                if (msgUpdate?.message) {
                    logger.info({ remoteJid: key.remoteJid, fromMe: key.fromMe }, 'Self-chat via messages.update');
                    const fullMsg = { key, message: msgUpdate.message, messageTimestamp: msgUpdate.messageTimestamp || Math.floor(Date.now() / 1000) } as any;
                    await maybeHandleBotQuery(fullMsg);
                }
            } catch (err) {
                logger.error({ err }, 'messages.update handler error');
            }
        }
    });
}

// ================================================================
// AI Chatbot Handler
// ================================================================

async function maybeHandleBotQuery(msg: proto.IWebMessageInfo) {
    if (!sock || !msg.message) return;

    const remoteJid = msg.key.remoteJid || '';
    if (remoteJid === 'status@broadcast') return;

    const contentType = getContentType(msg.message);
    const { text } = extractContent(msg, contentType);
    if (!text || text.length < 2) return;

    const isFromMe = msg.key.fromMe || false;
    const isSelfChat = remoteJid === ownerJid || remoteJid?.split('@')[0]?.split(':')[0] === sock?.user?.id?.split(':')[0]?.split('@')[0] || (ownerLid && remoteJid === ownerLid);
    const textLower = text.toLowerCase().trim();

    let isBotQuery = false;
    let queryText = text;

    if (isFromMe && isSelfChat) {
        isBotQuery = true;
    } else if (!isFromMe) {
        for (const trigger of BOT_TRIGGERS) {
            if (textLower.startsWith(trigger.toLowerCase())) {
                isBotQuery = true;
                queryText = text.substring(trigger.length).trim();
                if (!queryText) queryText = 'help';
                break;
            }
        }
    }

    if (!isBotQuery) return;

    // Handle "yes" confirmations for pending meetings
    const queryLower = queryText.toLowerCase().trim();
    if (queryLower === 'yes' || queryLower === 'confirm' || queryLower === 'y') {
        try {
            const userId = await ensureOwnerUser();
            const confirmed = await confirmPendingMeeting(userId, remoteJid);
            if (confirmed) return; // Confirmation handled
        } catch (err) {
            logger.warn({ err }, 'Meeting confirmation check failed');
        }
    }

    logger.info({ query: queryText.substring(0, 80), from: remoteJid }, 'Bot query received');
    syncStats.botQueries++;

    try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        const userId = await ensureOwnerUser();
        const response = await processBotQuery(queryText, userId);
        await sock.sendMessage(remoteJid, { text: response });
        syncStats.botResponses++;
        logger.info({ responseLength: response.length }, 'Bot response sent');
    } catch (err) {
        logger.error({ err }, 'Bot query processing failed');
        try {
            await sock.sendMessage(remoteJid, { text: '\u26a0\ufe0f Sorry, I encountered an error processing your request. Please try again.' });
        } catch {}
    } finally {
        try { await sock.sendPresenceUpdate('available', remoteJid); } catch {}
    }
}

async function processBotQuery(query: string, userId: string): Promise<string> {
    const intent = await classifyBotIntent(query);
    logger.info({ intent: intent.type, query: query.substring(0, 60) }, 'Intent classified');

    switch (intent.type) {
        case 'casual':
            return handleCasualBot(query);
        case 'command':
            return handleCommandBot();
        case 'commitment':
            return await handleCommitmentsBot(userId);
        case 'summarize':
            return await handleSummarizeBot(query, userId, intent);
        case 'meeting':
            return await handleMeetingBot(query, userId);
        case 'reminder':
            return await handleReminderBot(query, userId);
        case 'calendar_query':
            return await handleCalendarBot(query, userId);
        case 'retrieval':
        case 'question':
        default:
            return await handleSearchBot(query, userId, intent);
    }
}

// ================================================================
// Bot Intent Classification
// ================================================================

interface BotIntent {
    type: 'retrieval' | 'question' | 'summarize' | 'commitment' | 'casual' | 'command' | 'meeting' | 'reminder' | 'calendar_query';
    contactRef?: string;
    documentType?: string;
    dateRef?: string;
    searchQuery: string;
}

const CASUAL_PATTERNS = [
    /^(hi|hey|hello|yo|sup|morning|evening|night|thanks|thank you|ok|okay|cool|sure|bye|gm|gn)$/i,
    /^(good\s*(morning|evening|night|afternoon))$/i,
];

async function classifyBotIntent(message: string): Promise<BotIntent> {
    const lower = message.toLowerCase().trim();

    if (lower.length <= 3 || CASUAL_PATTERNS.some(p => p.test(lower))) {
        return { type: 'casual', searchQuery: '' };
    }
    if (lower === 'help' || lower === 'status' || lower.startsWith('/')) {
        return { type: 'command', searchQuery: '' };
    }
    if (/\b(commitment|promise|deadline|pending|owe|committed)\b/i.test(lower)) {
        return { type: 'commitment', searchQuery: message };
    }
    if (/\b(remind\s*me|set\s*(a\s*)?reminder|don'?t\s*let\s*me\s*forget)\b/i.test(lower)) {
        return { type: 'reminder', searchQuery: message };
    }
    if (/\b(if\s+\w+\s+(doesn'?t|don'?t|does\s*not)\s*(reply|respond|get\s*back))\b/i.test(lower)) {
        return { type: 'reminder', searchQuery: message };
    }
    if (/\b(schedule|meeting|call\s+at|meet\s+(on|at|tomorrow)|let'?s\s+meet|catch\s+up\s+(at|on))\b/i.test(lower)) {
        return { type: 'meeting', searchQuery: message };
    }
    if (/\b(my\s+(calendar|schedule|events|agenda)|what'?s\s+(on\s+my|coming\s+up)|upcoming\s+(events|meetings)|free\s+(time|slots))\b/i.test(lower)) {
        return { type: 'calendar_query', searchQuery: message };
    }

    if (!OPENROUTER_API_KEY) {
        return { type: 'question', searchQuery: message };
    }

    try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [
                    { role: 'system', content: 'Classify this WhatsApp message into one intent. Reply with strict JSON only. Intents: retrieval (find documents/files/messages), summarize (summarize a conversation), commitment (show promises/deadlines), meeting (schedule/create a meeting or call), reminder (set a reminder for something), calendar_query (check calendar/schedule/upcoming events), question (general question about their data), casual (greeting/thanks), command (help/status). Extract: contactRef (person name if mentioned), documentType (type of document if mentioned), dateRef (date/time reference), searchQuery (optimized search query). JSON format: {"type":"...","contactRef":"...","documentType":"...","dateRef":"...","searchQuery":"..."}' },
                    { role: 'user', content: message }
                ],
                temperature: 0.1,
                max_tokens: 256,
                response_format: { type: 'json_object' },
            }),
        });
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) {
            const parsed = JSON.parse(content);
            return {
                type: parsed.type || 'question',
                contactRef: parsed.contactRef || undefined,
                documentType: parsed.documentType || undefined,
                dateRef: parsed.dateRef || undefined,
                searchQuery: parsed.searchQuery || message,
            };
        }
    } catch (err) {
        logger.error({ err }, 'Bot intent classification failed');
    }

    return { type: 'question', searchQuery: message };
}

// ================================================================
// Bot Response Handlers
// ================================================================

function handleCasualBot(query: string): string {
    return "Hey! 👋 I'm Rememora, your WhatsApp memory & personal assistant.\n\nYou can ask me things like:\n🔍 \"Find my medical report from March\"\n📝 \"Summarise my conversation with Tanmay\"\n✅ \"Show my pending commitments\"\n📅 \"Schedule a meeting with Neha tomorrow at 3pm\"\n⏰ \"Remind me to call the bank on Friday\"\n🗓️ \"What's on my calendar this week?\"\n\nJust type your question naturally!";
}

function handleCommandBot(): string {
    return "🤖 *Rememora Commands*\n\n🔍 *Search* — Ask about any topic, file, or message\n• \"Find the proposal I sent to OROS\"\n• \"What did Neha send me yesterday?\"\n\n📝 *Summarize* — Get conversation summaries\n• \"Summarize my chat with the bankers\"\n• \"Recap my conversation with Mom\"\n\n✅ *Commitments* — Track promises & deadlines\n• \"Show my commitments\"\n• \"What did I promise to do?\"\n\n📅 *Meetings* — Schedule & manage meetings\n• \"Schedule a call with Neha tomorrow at 3pm\"\n• \"Meeting with team on Friday at 11am\"\n\n⏰ *Reminders* — Never forget anything\n• \"Remind me to call the bank tomorrow\"\n• \"If Tanmay doesn't reply in 48h, remind me\"\n• \"Remind me every Monday to review reports\"\n\n🗓️ *Calendar* — Check your schedule\n• \"What's on my calendar?\"\n• \"Show my upcoming events\"\n\n📄 *Documents* — Find files & attachments\n• \"Find my blood test report\"\n• \"Show PDFs from last month\"\n\n💡 *Tips:*\n• In self-chat: just type your question\n• In any chat: prefix with ! or @rememora";
}

async function handleCommitmentsBot(userId: string): Promise<string> {
    const { data: commitments } = await supabase
        .from('commitments')
        .select('title, committed_by, due_date, priority, status')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

    if (!commitments || commitments.length === 0) {
        return "\u2705 You don't have any pending commitments right now! Your slate is clean.";
    }

    let response = "\ud83d\udccb *Your Pending Commitments:*\n\n";
    commitments.forEach((c, i) => {
        const who = c.committed_by === 'me' ? 'You' : c.committed_by === 'them' ? 'They' : 'Mutual';
        const due = c.due_date ? ' \u2022 Due: ' + new Date(c.due_date).toLocaleDateString() : '';
        const priority = c.priority === 'high' ? ' \ud83d\udd34' : c.priority === 'medium' ? ' \ud83d\udfe1' : ' \ud83d\udfe2';
        response += (i + 1) + '. ' + c.title + priority + '\n   ' + who + due + '\n\n';
    });

    return response.trim();
}

// ================================================================
// Meeting Handler — Detect meeting from user's message & store
// ================================================================

async function handleMeetingBot(query: string, userId: string): Promise<string> {
    try {
        // Get user timezone
        const { data: user } = await supabase
            .from('users')
            .select('timezone')
            .eq('id', userId)
            .single();
        const tz = user?.timezone || 'Asia/Kolkata';

        // Use meeting detector LLM
        const { detectMeeting } = await import('../lib/meeting-detector');
        const meeting = await detectMeeting(query, 'Me', tz);

        if (!meeting.detected || meeting.confidence < 0.5) {
            return "🤔 I couldn't find clear meeting details in your message. Try something like:\n\n• \"Schedule a call with Neha tomorrow at 3pm\"\n• \"Meeting with the team on Friday at 11am\"\n• \"Let's catch up on Monday 2pm IST\"";
        }

        // Format the time nicely
        let startStr = '';
        try {
            const d = new Date(meeting.startTime);
            startStr = d.toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true,
            });
        } catch { startStr = meeting.startTime; }

        // Store in calendar_events table as tentative
        const { error } = await supabase.from('calendar_events').insert({
            user_id: userId,
            title: meeting.title,
            description: `Scheduled via Rememora bot`,
            start_time: meeting.startTime,
            end_time: meeting.endTime,
            timezone: meeting.timezone,
            participants: meeting.participants,
            meeting_link: meeting.meetingLink,
            location: meeting.location,
            conversation_context: query,
            key_topics: meeting.keyTopics,
            status: 'tentative',
        });

        if (error) {
            logger.error({ error }, 'Failed to store meeting');
            return '❌ Failed to save the meeting. Please try again.';
        }

        let response = `📅 *Meeting Detected*\n\n*${meeting.title}*\n🕐 ${startStr}`;
        if (meeting.timezone) response += ` ${meeting.timezone}`;
        response += `\n⏱ ${meeting.duration || 30} minutes`;

        if (meeting.participants.length > 0) {
            response += `\n👥 ${meeting.participants.map(p => p.name).join(', ')}`;
        }
        if (meeting.meetingLink) response += `\n🔗 ${meeting.meetingLink}`;
        if (meeting.location) response += `\n📍 ${meeting.location}`;

        if (meeting.ambiguities.length > 0) {
            response += `\n\n⚠️ ${meeting.ambiguities.join(', ')}`;
        }

        // Try to sync to Google Calendar
        let synced = false;
        try {
            const { createCalendarEvent, isCalendarConnected } = await import('../lib/google-calendar');
            const connected = await isCalendarConnected(supabase, userId);
            if (connected) {
                const eventId = await createCalendarEvent(supabase, userId, {
                    title: meeting.title,
                    description: `Scheduled via Rememora`,
                    startTime: meeting.startTime,
                    endTime: meeting.endTime,
                    timezone: meeting.timezone,
                    meetingLink: meeting.meetingLink,
                    location: meeting.location,
                    participants: meeting.participants,
                });
                if (eventId) {
                    synced = true;
                    // Update stored event with Google event ID and confirm
                    await supabase
                        .from('calendar_events')
                        .update({ google_event_id: eventId, status: 'confirmed' })
                        .eq('user_id', userId)
                        .eq('status', 'tentative')
                        .order('created_at', { ascending: false })
                        .limit(1);
                }
            }
        } catch (err) {
            logger.warn({ err }, 'Google Calendar sync skipped');
        }

        response += synced
            ? '\n\n✅ Added to your Google Calendar!'
            : '\n\n💡 Connect Google Calendar in settings for auto-sync.\nReply *yes* to confirm this meeting.';

        return response;
    } catch (err) {
        logger.error({ err }, 'Meeting handler failed');
        return '❌ Something went wrong detecting the meeting. Please try again.';
    }
}

// ================================================================
// Reminder Handler — Parse & store reminder
// ================================================================

async function handleReminderBot(query: string, userId: string): Promise<string> {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('timezone')
            .eq('id', userId)
            .single();
        const tz = user?.timezone || 'Asia/Kolkata';

        const { parseSmartReminder } = await import('../lib/smart-reminder');
        const parsed = await parseSmartReminder(query, tz, 'Me');

        if (parsed.confidence < 0.4) {
            return "🤔 I wasn't sure how to set that reminder. Try something like:\n\n• \"Remind me to call Imran tomorrow at 3pm\"\n• \"If Tanmay doesn't reply in 48 hours, remind me\"\n• \"Remind me every Monday to review reports\"";
        }

        // Resolve conditional contact if needed
        if (parsed.type === 'conditional' && parsed.conditionJson?.contactName) {
            const { data: contacts } = await supabase
                .from('contacts')
                .select('wa_id')
                .eq('user_id', userId)
                .ilike('display_name', `%${parsed.conditionJson.contactName}%`)
                .limit(1);

            if (contacts && contacts.length > 0) {
                parsed.conditionJson.contactWaId = contacts[0].wa_id;
            }
            if (!parsed.conditionJson.checkAfter) {
                parsed.conditionJson.checkAfter = new Date().toISOString();
            }
        }

        // Build insert data
        const insertData: any = {
            user_id: userId,
            text: parsed.text,
            trigger_type: parsed.type,
            status: 'pending',
            context_summary: parsed.contextSummary,
            created_at: new Date().toISOString(),
        };

        if (parsed.type === 'time' && parsed.dueAt) {
            insertData.due_at = parsed.dueAt;
        } else if (parsed.type === 'conditional' && parsed.conditionJson) {
            insertData.condition_json = parsed.conditionJson;
            insertData.contact_wa_id = parsed.conditionJson.contactWaId;
            const addHours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
            insertData.due_at = addHours((parsed.conditionJson.waitHours || 24) + 1);
        } else if (parsed.type === 'recurring' && parsed.recurrenceRule) {
            insertData.recurrence_rule = parsed.recurrenceRule;
            // Simple next-time calc: tomorrow 9am default
            const next = new Date();
            next.setDate(next.getDate() + 1);
            next.setHours(9, 0, 0, 0);
            insertData.due_at = next.toISOString();
        }

        const { error } = await supabase.from('reminders').insert(insertData);

        if (error) {
            logger.error({ error }, 'Failed to store reminder');
            return '❌ Failed to create reminder. Please try again.';
        }

        // Format confirmation
        if (parsed.type === 'time' && parsed.dueAt) {
            let dueStr = '';
            try {
                const d = new Date(parsed.dueAt);
                dueStr = d.toLocaleString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true,
                });
            } catch { dueStr = parsed.dueAt; }
            return `⏰ *Reminder set!*\n\n"${parsed.text}"\n📅 ${dueStr}`;
        } else if (parsed.type === 'conditional') {
            const contact = parsed.conditionJson?.contactName || 'them';
            const hours = parsed.conditionJson?.waitHours || 24;
            return `🔔 *Conditional reminder set!*\n\n"${parsed.text}"\n⏳ I'll remind you if ${contact} doesn't reply within ${hours} hours.`;
        } else if (parsed.type === 'recurring') {
            return `🔁 *Recurring reminder set!*\n\n"${parsed.text}"\n📅 Repeating based on: ${parsed.recurrenceRule || 'daily'}`;
        }

        return `✅ Reminder set: "${parsed.text}"`;
    } catch (err) {
        logger.error({ err }, 'Reminder handler failed');
        return '❌ Something went wrong setting the reminder. Please try again.';
    }
}

// ================================================================
// Calendar Query Handler — Show upcoming events
// ================================================================

async function handleCalendarBot(query: string, userId: string): Promise<string> {
    try {
        // First check local calendar_events table
        const { data: localEvents } = await supabase
            .from('calendar_events')
            .select('title, start_time, end_time, timezone, status, meeting_link')
            .eq('user_id', userId)
            .in('status', ['confirmed', 'tentative'])
            .gt('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(10);

        // Try Google Calendar too
        let googleEvents: any[] = [];
        try {
            const { getUpcomingEvents, isCalendarConnected } = await import('../lib/google-calendar');
            const connected = await isCalendarConnected(supabase, userId);
            if (connected) {
                googleEvents = await getUpcomingEvents(supabase, userId, 10);
            }
        } catch (err) {
            logger.warn({ err }, 'Google Calendar fetch skipped');
        }

        // Merge and deduplicate (prefer Google events if both exist)
        const allEvents: Array<{ title: string; startTime: string; endTime?: string; source: string; link?: string }> = [];

        const googleIds = new Set(googleEvents.map(e => e.title?.toLowerCase()));

        for (const e of (localEvents || [])) {
            if (!googleIds.has(e.title?.toLowerCase())) {
                allEvents.push({
                    title: e.title,
                    startTime: e.start_time,
                    endTime: e.end_time,
                    source: 'rememora',
                    link: e.meeting_link,
                });
            }
        }

        for (const e of googleEvents) {
            allEvents.push({
                title: e.title,
                startTime: e.startTime,
                endTime: e.endTime,
                source: 'google',
                link: e.link,
            });
        }

        // Sort by start time
        allEvents.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

        if (allEvents.length === 0) {
            const hasGoogle = googleEvents !== undefined;
            return hasGoogle
                ? "📅 No upcoming events on your calendar. You're all clear!"
                : "📅 No upcoming events found.\n\n💡 Connect Google Calendar in settings to see all your events here.";
        }

        let response = '📅 *Your Upcoming Events:*\n\n';
        allEvents.slice(0, 8).forEach((e, i) => {
            let timeStr = '';
            try {
                const d = new Date(e.startTime);
                timeStr = d.toLocaleString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit', hour12: true,
                });
            } catch { timeStr = e.startTime; }

            const src = e.source === 'google' ? ' 🔄' : '';
            response += `${i + 1}. *${e.title}*${src}\n   🕐 ${timeStr}`;
            if (e.link) response += `\n   🔗 ${e.link}`;
            response += '\n\n';
        });

        if (googleEvents.length === 0) {
            response += '💡 Connect Google Calendar for complete event sync.';
        }

        return response.trim();
    } catch (err) {
        logger.error({ err }, 'Calendar query handler failed');
        return '❌ Something went wrong fetching your calendar. Please try again.';
    }
}

// ================================================================
// Confirm Pending Meeting — Called when user replies "yes"
// ================================================================

async function confirmPendingMeeting(userId: string, remoteJid: string): Promise<boolean> {
    // Find most recent tentative meeting
    const { data: pendingMeeting } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'tentative')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!pendingMeeting) return false;

    // Update to confirmed
    await supabase
        .from('calendar_events')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', pendingMeeting.id);

    // Try Google Calendar sync
    let synced = false;
    try {
        const { createCalendarEvent, isCalendarConnected } = await import('../lib/google-calendar');
        const connected = await isCalendarConnected(supabase, userId);
        if (connected) {
            const eventId = await createCalendarEvent(supabase, userId, {
                title: pendingMeeting.title,
                description: pendingMeeting.description,
                startTime: pendingMeeting.start_time,
                endTime: pendingMeeting.end_time,
                timezone: pendingMeeting.timezone,
                meetingLink: pendingMeeting.meeting_link,
                location: pendingMeeting.location,
                participants: pendingMeeting.participants,
            });
            if (eventId) {
                await supabase
                    .from('calendar_events')
                    .update({ google_event_id: eventId })
                    .eq('id', pendingMeeting.id);
                synced = true;
            }
        }
    } catch (err) {
        logger.warn({ err }, 'Google Calendar sync on confirm failed');
    }

    let startStr = '';
    try {
        startStr = new Date(pendingMeeting.start_time).toLocaleString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true,
        });
    } catch { startStr = pendingMeeting.start_time; }

    const syncMsg = synced
        ? '✅ Also synced to Google Calendar!'
        : '💡 Connect Google Calendar in settings for auto-sync.';

    if (sock) {
        await sock.sendMessage(remoteJid, {
            text: `✅ *Meeting confirmed!*\n\n*${pendingMeeting.title}*\n🕐 ${startStr}\n\n${syncMsg}\n\nI'll send you a reminder 20 minutes before.`,
        });
    }

    return true;
}

async function handleSummarizeBot(query: string, userId: string, intent: BotIntent): Promise<string> {
    const contactRef = intent.contactRef || '';
    if (!contactRef) return handleSearchBot(query, userId, intent);

    const { data: chats } = await supabase
        .from('chats')
        .select('id, title')
        .eq('user_id', userId)
        .ilike('title', '%' + contactRef + '%')
        .limit(1);

    if (!chats || chats.length === 0) {
        return "I couldn't find a chat matching \"" + contactRef + "\". Try a different name or ask me to search instead.";
    }

    const chat = chats[0];
    const { data: messages } = await supabase
        .from('messages')
        .select('sender_name, text_content, timestamp')
        .eq('chat_id', chat.id)
        .eq('user_id', userId)
        .not('text_content', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(80);

    if (!messages || messages.length === 0) {
        return "I found the chat with " + chat.title + " but there are no messages to summarize yet.";
    }

    const msgContext = messages.reverse().map(m =>
        '[' + new Date(m.timestamp).toLocaleDateString() + '] ' + m.sender_name + ': ' + m.text_content
    ).join('\n');

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages: [
                { role: 'system', content: 'You are Rememora, a WhatsApp AI assistant. Summarize the following conversation concisely in 3-5 bullet points. Mention key topics, decisions, and action items. Format for WhatsApp (use * for bold, bullet points with \u2022). Keep it under 500 characters.' },
                { role: 'user', content: 'Conversation with ' + chat.title + ':\n\n' + msgContext.substring(0, 6000) }
            ],
            temperature: 0.3,
            max_tokens: 512,
        }),
    });

    const data = await res.json();
    const summary = data?.choices?.[0]?.message?.content;
    if (!summary) return "Sorry, I couldn't generate a summary. Please try again.";
    return "\ud83d\udcdd *Summary: " + chat.title + "*\n\n" + summary;
}

async function handleSearchBot(query: string, userId: string, intent: BotIntent): Promise<string> {
    const searchQuery = intent.searchQuery || query;

    let embedding: number[] | null = null;
    if (OPENROUTER_API_KEY) {
        try {
            const embRes = await fetch('https://openrouter.ai/api/v1/embeddings', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: EMBEDDING_MODEL, input: searchQuery.substring(0, 4000) }),
            });
            const embData = await embRes.json();
            embedding = embData?.data?.[0]?.embedding || null;
        } catch (err) {
            logger.warn({ err }, 'Embedding generation failed, falling back to text search');
        }
    }

    let searchResults: any[] = [];
    if (embedding) {
        const { data } = await supabase.rpc('match_embeddings', {
            query_embedding: JSON.stringify(embedding),
            match_count: 8,
            p_user_id: userId,
        }).select('*');
        searchResults = data || [];
    }

    if (searchResults.length === 0) {
        const { data } = await supabase
            .from('messages')
            .select('id, sender_name, text_content, timestamp, chat_id')
            .eq('user_id', userId)
            .ilike('text_content', '%' + searchQuery.split(' ').slice(0, 3).join('%') + '%')
            .order('timestamp', { ascending: false })
            .limit(8);

        searchResults = (data || []).map(m => ({
            chunk_text: m.text_content,
            message_id: m.id,
            chat_id: m.chat_id,
            metadata: { sender_name: m.sender_name, timestamp: m.timestamp },
        }));
    }

    if (searchResults.length === 0) {
        return "I couldn't find anything matching \"" + query + "\" in your WhatsApp history. Try different keywords or a broader search.";
    }

    const chatIds = [...new Set(searchResults.map(r => r.chat_id).filter(Boolean))];
    let chatMap = new Map<string, string>();
    if (chatIds.length > 0) {
        const { data: chats } = await supabase.from('chats').select('id, title').in('id', chatIds);
        (chats || []).forEach(c => chatMap.set(c.id, c.title));
    }

    const contextParts = searchResults.map((r, i) => {
        const parts = ['[' + (i + 1) + ']', r.chunk_text || ''];
        if (r.metadata?.sender_name) parts.push('From: ' + r.metadata.sender_name);
        const chatTitle = chatMap.get(r.chat_id);
        if (chatTitle) parts.push('Chat: ' + chatTitle);
        if (r.metadata?.timestamp) {
            try { parts.push('Date: ' + new Date(r.metadata.timestamp).toLocaleDateString()); } catch {}
        }
        return parts.join(' | ');
    });

    const context = contextParts.join('\n\n');

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: LLM_MODEL,
            messages: [
                { role: 'system', content: 'You are Rememora, a WhatsApp AI assistant that helps users find information in their WhatsApp history. Answer based strictly on the provided context. Reference specific messages using [1], [2] etc. Format for WhatsApp: use *bold* for emphasis, bullet points with \u2022. Be concise (under 500 chars). If the context does not contain enough info, say so clearly.' },
                { role: 'user', content: 'Context from WhatsApp messages:\n\n' + context.substring(0, 6000) + '\n\n---\n\nUser question: ' + query }
            ],
            temperature: 0.5,
            max_tokens: 512,
        }),
    });

    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) return "Sorry, I found some results but couldn't generate an answer. Please try rephrasing your question.";
    return answer;
}

// ================================================================
// Message handling
// ================================================================

function mapMessageType(contentType: string | undefined): string {
    const map: Record<string, string> = {
        'conversation': 'text',
        'extendedTextMessage': 'text',
        'imageMessage': 'image',
        'videoMessage': 'video',
        'audioMessage': 'audio',
        'documentMessage': 'document',
        'stickerMessage': 'sticker',
        'locationMessage': 'location',
        'contactMessage': 'contact',
        'contactsArrayMessage': 'contact',
        'reactionMessage': 'reaction',
        'protocolMessage': 'system',
        'senderKeyDistributionMessage': 'system',
    };
    return map[contentType || ''] || 'text';
}

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

    const contactId = await ensureContact(userId, senderPhone, senderJid, msg.pushName || undefined);
    const chatId = await ensureChat(userId, remoteJid, isGroup, msg.pushName || undefined);

    const { data: stored, error } = await supabase.from('messages').insert({
        user_id: userId,
        chat_id: chatId,
        contact_id: contactId,
        wa_message_id: msg.key.id || '',
        sender_phone: senderPhone,
        message_type: mapMessageType(contentType),
        sender_name: msg.pushName || senderPhone,
        text_content: text || '',
        is_from_me: msg.key.fromMe || false,
        is_forwarded: false,
        raw_payload: { content_type: contentType, media_type: mediaType, is_group: isGroup, sender_jid: senderJid },
        timestamp,
    }).select('id').single();

    if (error) {
        if (isHistory && error.code === '23505') return;
        logger.error({ error }, 'Store failed');
        return;
    }

    if (mediaType && stored && !isHistory) {
        try {
            const buf = await downloadMediaMessage(msg, 'buffer', {});
            if (buf) await storeAttachment(userId, stored.id, chatId, buf as Buffer, mediaType, mimeType || 'application/octet-stream');
        } catch (err) {
            logger.error({ err }, 'Media download failed');
        }
    }

    if (text && text.length > 10 && stored && !isHistory) {
        try {
            await generateEmbedding(userId, chatId, stored.id, text);
        } catch (err) {
            logger.error({ err, messageId: stored.id }, 'Failed to generate embedding');
        }
    }

    // ---- Real-time auto-detection (commitments & meetings) ----
    // Run in background for non-history, non-bot messages with meaningful text
    if (text && text.length > 15 && stored && !isHistory && BOT_ENABLED) {
        runAutoDetection(userId, text, chatId, contactId, senderPhone, msg.pushName || senderPhone, msg.key.fromMe || false).catch(err => {
            logger.warn({ err }, 'Auto-detection background task failed');
        });
    }
}

// ================================================================
// Real-time Auto-Detection (commitments & meetings in background)
// ================================================================

async function runAutoDetection(
    userId: string,
    text: string,
    chatId: string,
    contactId: string,
    senderPhone: string,
    senderName: string,
    isFromMe: boolean
) {
    // Auto-detect commitments
    try {
        const { detectCommitment } = await import('../lib/commitment-detector');
        const commitment = await detectCommitment(text, senderName, isFromMe);

        if (commitment.detected && commitment.confidence >= 0.75) {
            // Check for duplicates
            const { data: existing } = await supabase
                .from('commitments')
                .select('id')
                .eq('user_id', userId)
                .eq('text', commitment.text)
                .limit(1);

            if (!existing || existing.length === 0) {
                await supabase.from('commitments').insert({
                    user_id: userId,
                    chat_id: chatId,
                    contact_id: contactId,
                    text: commitment.text,
                    committed_by: commitment.committedBy,
                    priority: commitment.priority,
                    status: 'pending',
                    due_date: commitment.dueDate,
                    created_at: new Date().toISOString(),
                });
                logger.info({ text: commitment.text.substring(0, 50) }, 'Auto-detected commitment');

                // Notify user in self-chat if it's their own commitment
                if ((commitment.committedBy === 'me' || commitment.committedBy === 'mutual') && sock && ownerJid) {
                    const dueStr = commitment.dueDate
                        ? `\n📅 Due: ${new Date(commitment.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
                        : '';
                    const priorityStr = commitment.priority === 'high' ? '\n🔴 High priority' : '';
                    await sock.sendMessage(ownerJid, {
                        text: `📌 *Commitment auto-detected*\n\n"${commitment.text}"${dueStr}${priorityStr}\n\n_From chat with ${senderName}_`,
                    });
                }
            }
        }
    } catch (err) {
        logger.warn({ err }, 'Commitment auto-detection failed');
    }

    // Auto-detect meetings
    try {
        const { detectMeeting } = await import('../lib/meeting-detector');
        const { data: user } = await supabase
            .from('users')
            .select('timezone')
            .eq('id', userId)
            .single();
        const tz = user?.timezone || 'Asia/Kolkata';

        const meeting = await detectMeeting(text, senderName, tz);

        if (meeting.detected && meeting.confidence >= 0.7) {
            // Check if we already have a similar meeting around that time
            const { data: existing } = await supabase
                .from('calendar_events')
                .select('id')
                .eq('user_id', userId)
                .eq('title', meeting.title)
                .limit(1);

            if (!existing || existing.length === 0) {
                await supabase.from('calendar_events').insert({
                    user_id: userId,
                    chat_id: chatId,
                    title: meeting.title,
                    description: `Auto-detected from conversation with ${senderName}`,
                    start_time: meeting.startTime,
                    end_time: meeting.endTime,
                    timezone: meeting.timezone,
                    participants: meeting.participants,
                    meeting_link: meeting.meetingLink,
                    location: meeting.location,
                    conversation_context: text,
                    key_topics: meeting.keyTopics,
                    status: 'tentative',
                });
                logger.info({ title: meeting.title }, 'Auto-detected meeting');

                // Notify user
                if (sock && ownerJid) {
                    let startStr = '';
                    try {
                        startStr = new Date(meeting.startTime).toLocaleString('en-US', {
                            weekday: 'short', month: 'short', day: 'numeric',
                            hour: 'numeric', minute: '2-digit', hour12: true,
                        });
                    } catch { startStr = meeting.startTime; }

                    await sock.sendMessage(ownerJid, {
                        text: `📅 *Meeting auto-detected*\n\n*${meeting.title}*\n🕐 ${startStr}\n👥 ${meeting.participants.map(p => p.name).join(', ')}\n\n_From chat with ${senderName}_\n\nReply *yes* to add to your calendar.`,
                    });
                }
            }
        }
    } catch (err) {
        logger.warn({ err }, 'Meeting auto-detection failed');
    }
}

// ================================================================
// Content extraction
// ================================================================

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

// ================================================================
// Contact & Chat helpers
// ================================================================

async function ensureContact(userId: string, phone: string, jid: string, pushName?: string): Promise<string> {
    const { data } = await supabase.from('contacts').select('id, display_name').eq('wa_id', jid).eq('user_id', userId).maybeSingle();
    if (data) {
        // Update display_name if we have a real pushName and current name is just a phone number
        if (pushName && pushName !== phone && /^\d{7,}$/.test((data.display_name || '').replace(/\D/g, ''))) {
            await supabase.from('contacts').update({ display_name: pushName }).eq('id', data.id);
        }
        return data.id;
    }
    const displayName = pushName && pushName !== phone ? pushName : phone;
    const { data: c, error } = await supabase.from('contacts').insert({ user_id: userId, wa_id: jid, display_name: displayName }).select('id').single();
    if (error) {
        const { data: r } = await supabase.from('contacts').select('id').eq('wa_id', jid).eq('user_id', userId).maybeSingle();
        return r?.id || 'unknown';
    }
    return c.id;
}

async function ensureChat(userId: string, jid: string, isGroup: boolean, pushName?: string): Promise<string> {
    const { data } = await supabase.from('chats').select('id, title').eq('wa_chat_id', jid).eq('user_id', userId).maybeSingle();
    if (data) {
        // Update title if we have a real pushName and current title is just a phone number
        if (!isGroup && pushName && /^\d{7,}$/.test((data.title || '').replace(/\D/g, ''))) {
            await supabase.from('chats').update({ title: pushName }).eq('id', data.id);
        }
        return data.id;
    }
    let chatTitle = pushName && !isGroup ? pushName : jid.split('@')[0];
    if (isGroup && sock) {
        try { chatTitle = (await sock.groupMetadata(jid)).subject || chatTitle; } catch (err) {
            logger.debug({ err, jid }, 'Failed to fetch group metadata');
        }
    }
    const { data: c, error } = await supabase.from('chats').insert({ user_id: userId, wa_chat_id: jid, chat_type: isGroup ? 'group' : 'individual', title: chatTitle }).select('id').single();
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
    if (uploadErr) { logger.error({ uploadErr }, 'Upload failed'); return; }
    const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(key);
    await supabase.from('attachments').insert({
        user_id: userId, message_id: msgId, file_type: type, mime_type: mime,
        file_size_bytes: buf.length, storage_key: key, storage_url: urlData?.publicUrl || key,
    });
}

// ================================================================
// Embeddings
// ================================================================

async function generateEmbedding(userId: string, chatId: string, msgId: string, text: string) {
    if (!OPENROUTER_API_KEY) return;
    const r = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.substring(0, 8000) }),
    });
    const d = await r.json();
    const emb = d?.data?.[0]?.embedding;
    if (emb) {
        await supabase.from('embeddings').insert({
            user_id: userId, message_id: msgId, chat_id: chatId,
            chunk_index: 0, chunk_text: text.substring(0, 8000), embedding: JSON.stringify(emb),
        });
    }
}

// ================================================================
// Main
// ================================================================

async function main() {
    logger.info('=== Rememora Baileys Bridge + AI Chatbot ===');
    logger.info({ bot: BOT_ENABLED, triggers: BOT_TRIGGERS }, 'Bot configuration');
    app.listen(PORT, '0.0.0.0', () => logger.info('Server on port ' + PORT + ' - QR at /qr'));
    await startBaileys();
}

// Graceful shutdown — clean up socket on SIGTERM/SIGINT (e.g. Railway redeploy)
function gracefulShutdown(signal: string) {
    logger.info({ signal }, 'Received shutdown signal, cleaning up...');
    if (sock) {
        try { sock.end(undefined); } catch {}
        sock = null;
    }
    connectionStatus = 'disconnected';
    process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

main().catch(err => {
    logger.error({ err }, 'Fatal');
    process.exit(1);
});
