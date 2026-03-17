const DEFAULT_BRIDGE_URL = 'https://chatvault-ai-production.up.railway.app';
const BRIDGE_FETCH_TIMEOUT_MS = 8000;

export interface BridgeStatusPayload {
    connected: boolean;
    status: string;
    phone: string | null;
    name: string | null;
    sync: Record<string, unknown> | null;
    source: 'server-proxy';
}

export interface BridgeQrPayload {
    connected: boolean;
    state: 'loading' | 'qr' | 'connected';
    qrCode: string | null;
    source: 'server-proxy';
}

function getBridgeUrl() {
    return process.env.NEXT_PUBLIC_BRIDGE_URL || DEFAULT_BRIDGE_URL;
}

function jsonHeaders() {
    return {
        'Accept': 'application/json',
    };
}

function extractQrCodeFromHtml(html: string) {
    const match = html.match(/<img[^>]+src=(?:"|')(data:image\/[^"']+)(?:"|')/i);
    return match?.[1] ?? null;
}

export async function fetchBridgeStatus(): Promise<BridgeStatusPayload> {
    const res = await fetch(`${getBridgeUrl()}/status`, {
        method: 'GET',
        headers: jsonHeaders(),
        signal: AbortSignal.timeout(BRIDGE_FETCH_TIMEOUT_MS),
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Bridge returned ${res.status}`);
    }

    const data = await res.json();
    return {
        connected: data.connected ?? false,
        status: data.status || 'disconnected',
        phone: data.phone || null,
        name: data.name || null,
        sync: data.sync || null,
        source: 'server-proxy',
    };
}

export async function fetchBridgeQr(): Promise<BridgeQrPayload> {
    const res = await fetch(`${getBridgeUrl()}/qr?embed=1`, {
        method: 'GET',
        signal: AbortSignal.timeout(BRIDGE_FETCH_TIMEOUT_MS),
        cache: 'no-store',
    });

    if (!res.ok) {
        throw new Error(`Bridge returned ${res.status}`);
    }

    const html = await res.text();
    const qrCode = extractQrCodeFromHtml(html);

    if (qrCode) {
        return {
            connected: false,
            state: 'qr',
            qrCode,
            source: 'server-proxy',
        };
    }

    if (/Connected to WhatsApp|>Connected</i.test(html)) {
        return {
            connected: true,
            state: 'connected',
            qrCode: null,
            source: 'server-proxy',
        };
    }

    return {
        connected: false,
        state: 'loading',
        qrCode: null,
        source: 'server-proxy',
    };
}
