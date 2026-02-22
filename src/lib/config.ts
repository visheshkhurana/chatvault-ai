// ============================================================
// Centralized Configuration Management
// ============================================================
// All env vars referenced in one place for easy auditing.

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function optionalEnv(name: string, defaultValue: string): string {
    return process.env[name] || defaultValue;
}

// --- Supabase ---
export const config = {
    supabase: {
        url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
        anonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },

    // --- OpenRouter / LLM ---
    openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY || '',
        model: optionalEnv('OPENROUTER_MODEL', 'qwen/qwen-2.5-72b-instruct'),
        embeddingModel: optionalEnv('OPENROUTER_EMBEDDING_MODEL', 'openai/text-embedding-3-small'),
    },

    // --- OpenAI (for Whisper transcription) ---
    openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
    },

    // --- WhatsApp Cloud API ---
    whatsapp: {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
        appSecret: process.env.WHATSAPP_APP_SECRET || '',
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    },

    // --- Backblaze B2 Storage ---
    storage: {
        bucketName: optionalEnv('B2_BUCKET_NAME', 'chatvault'),
        region: optionalEnv('B2_REGION', 'us-west-004'),
        endpoint: process.env.B2_ENDPOINT || '',
        keyId: process.env.B2_KEY_ID || '',
        applicationKey: process.env.B2_APPLICATION_KEY || '',
    },

    // --- Google Cloud Vision (optional OCR fallback) ---
    google: {
        visionApiKey: process.env.GOOGLE_CLOUD_VISION_API_KEY || '',
    },

    // --- App Settings ---
    app: {
        nodeEnv: optionalEnv('NODE_ENV', 'development'),
        isDev: process.env.NODE_ENV !== 'production',
        baileysPort: parseInt(optionalEnv('BAILEYS_PORT', '3001'), 10),
    },
} as const;

// --- Validate critical config at import time (server-side only) ---
export function validateServerConfig(): string[] {
    const missing: string[] = [];

    if (!config.supabase.serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!config.openrouter.apiKey && !config.openai.apiKey) {
        missing.push('OPENROUTER_API_KEY or OPENAI_API_KEY');
    }

    return missing;
}
