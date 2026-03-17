import { NextResponse } from 'next/server';
import { fetchBridgeQr } from '@/lib/bridge-proxy';

export async function GET() {
    try {
        const data = await fetchBridgeQr();
        return NextResponse.json(data, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (err) {
        return NextResponse.json(
            {
                connected: false,
                state: 'loading',
                qrCode: null,
                error: err instanceof Error ? err.message : 'Bridge unreachable',
                source: 'server-proxy',
            },
            {
                status: 502,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }
}
