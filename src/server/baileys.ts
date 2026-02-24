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
let ownerJid: string | null = null;

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

const app = express();
app.use(cors());

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
    });
});

// ================================================================
// Welcome Message on First Connection
// ================================================================

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
        logger.info('Welcome message sent to self-chat');

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
        logger: pino({ level: 'debug' }),
        
        printQRInTerminal: true,
                browser: ['Ubuntu', 'Chrome', '20.0.04'],
                connectTimeoutMs: 60000,
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
            logger.info('Connected!');
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
                logger.error({ code, error: lastDisconnect?.error?.message || lastDisconnect?.error, stack: lastDisconnect?.error?.stack }, 'Connection closed, reconnecting in 5s...');
                setTimeout(startBaileys, 5000);
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

        if (isHistory) {
            syncStats.inProgress = true;
            if (!syncStats.startedAt) syncStats.startedAt = new Date();
            logger.info({ count: messages.length }, 'History sync batch received');
        }

        for (const msg of messages) {
            try {
                await handleMessage(msg, isHistory);

                // Chatbot: check if this is a bot query (only for real-time messages)
                if (!isHistory && BOT_ENABLED && type === 'notify') {
                    await maybeHandleBotQuery(msg);
                }
            } catch (err) {
                logger.error({ err, id: msg.key.id }, 'Message error');
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
    const isSelfChat = remoteJid === ownerJid || remoteJid?.split('@')[0]?.split(':')[0] === sock?.user?.id?.split(':')[0]?.split('@')[0];
    const textLower = text.toLowerCase().trim();

    let isBotQuery = false;
    let queryText = text;

    if (isFromMe && isSelfChat) {
        isBotQuery = true;
    } else if (isFromMe) {
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
    type: 'retrieval' | 'question' | 'summarize' | 'commitment' | 'casual' | 'command';
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
                    { role: 'system', content: 'Classify this WhatsApp message into one intent. Reply with strict JSON only. Intents: retrieval (find documents/files/messages), summarize (summarize a conversation), commitment (show promises/deadlines), question (general question about their data), casual (greeting/thanks), command (help/status). Extract: contactRef (person name if mentioned), documentType (type of document if mentioned), dateRef (date/time reference), searchQuery (optimized search query). JSON format: {"type":"...","contactRef":"...","documentType":"...","dateRef":"...","searchQuery":"..."}' },
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
    return "Hey! \ud83d\udc4b I'm Rememora, your WhatsApp memory assistant.\n\nYou can ask me things like:\n\u2022 \"Find my medical report from March\"\n\u2022 \"Summarise my conversation with Tanmay\"\n\u2022 \"What documents did I share last week?\"\n\u2022 \"Show my pending commitments\"\n\nJust type your question naturally!";
}

function handleCommandBot(): string {
    return "\ud83e\udd16 *Rememora Commands*\n\n\ud83d\udd0d *Search* \u2014 Ask about any topic, file, or message\n\u2022 \"Find the proposal I sent to OROS\"\n\u2022 \"What did Neha send me yesterday?\"\n\n\ud83d\udcdd *Summarize* \u2014 Get conversation summaries\n\u2022 \"Summarize my chat with the bankers\"\n\u2022 \"Recap my conversation with Mom\"\n\n\u2705 *Commitments* \u2014 Track promises & deadlines\n\u2022 \"Show my commitments\"\n\u2022 \"What did I promise to do?\"\n\n\ud83d\udcc4 *Documents* \u2014 Find files & attachments\n\u2022 \"Find my blood test report\"\n\u2022 \"Show PDFs from last month\"\n\n\ud83d\udca1 *Tips:*\n\u2022 In self-chat: just type your question\n\u2022 In any chat: prefix with ! or @rememora";
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

    const contactId = await ensureContact(userId, senderPhone, senderJid);
    const chatId = await ensureChat(userId, remoteJid, isGroup);

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

async function ensureContact(userId: string, phone: string, jid: string): Promise<string> {
    const { data } = await supabase.from('contacts').select('id').eq('wa_id', jid).eq('user_id', userId).maybeSingle();
    if (data) return data.id;
    const { data: c, error } = await supabase.from('contacts').insert({ user_id: userId, wa_id: jid, display_name: phone }).select('id').single();
    if (error) {
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

main().catch(err => {
    logger.error({ err }, 'Fatal');
    process.exit(1);
});
