import { NextResponse } from 'next/server';
import { fetchBridgeStatus } from '@/lib/bridge-proxy';

export async function GET() {
    try {
        const data = await fetchBridgeStatus();
        return NextResponse.json(data, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (err) {
        return NextResponse.json(
            {
                connected: false,
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
