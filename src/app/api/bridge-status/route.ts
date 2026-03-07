import { NextResponse } from 'next/server';

// ============================================================
// Server-side Bridge Status Proxy
// GET /api/bridge-status
//
// This endpoint calls the Baileys bridge from the server side,
// completely bypassing CORS restrictions. The frontend can call
// this as a fallback when direct browser→bridge requests fail.
// ============================================================

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

export async function GET() {
    try {
        const res = await fetch(`${BRIDGE_URL}/status`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json(
                { connected: false, error: `Bridge returned ${res.status}` },
                { status: 502 }
            );
        }

        const data = await res.json();
        return NextResponse.json({
            connected: data.connected ?? false,
            status: data.status || 'disconnected',
            phone: data.phone || null,
            name: data.name || null,
            sync: data.sync || null,
            source: 'server-proxy',
        });
    } catch (err) {
        return NextResponse.json(
            {
                connected: false,
                error: err instanceof Error ? err.message : 'Bridge unreachable',
                source: 'server-proxy',
            },
            { status: 502 }
        );
    }
}
