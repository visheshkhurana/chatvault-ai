import { NextResponse } from 'next/server';

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

export async function GET() {
    try {
        const res = await fetch(`${BRIDGE_URL}/qr-data`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json(
                { qr: null, status: 'error', error: `Bridge returned ${res.status}` },
                { status: 502 }
            );
        }

        const data = await res.json();
        return NextResponse.json({
            qr: data.qr || null,
            status: data.status || 'disconnected',
        });
    } catch (err) {
        return NextResponse.json(
            {
                qr: null,
                status: 'error',
                error: err instanceof Error ? err.message : 'Bridge unreachable',
            },
            { status: 502 }
        );
    }
}
