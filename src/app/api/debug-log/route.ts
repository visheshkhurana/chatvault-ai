import { appendFile } from 'fs/promises';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        await appendFile('/opt/cursor/logs/debug.log', `${JSON.stringify(payload)}\n`);
        return NextResponse.json({ ok: true });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : 'Failed to write debug log' },
            { status: 500 }
        );
    }
}
