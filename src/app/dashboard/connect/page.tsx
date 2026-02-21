'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

export default function ConnectPage() {
    const router = useRouter();
    const [status, setStatus] = useState<'loading' | 'qr' | 'connected'>('loading');
    const [qrKey, setQrKey] = useState(0);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch(`${BRIDGE_URL}/health`);
                const data = await res.json();
                if (data.ok && data.status === 'connected') {
                    setStatus('connected');
                } else {
                    setStatus('qr');
                }
            } catch {
                setStatus('qr');
            }
        };

        checkStatus();
        const interval = setInterval(() => {
            checkStatus();
            setQrKey(k => k + 1);
        }, 15000);

        return () => clearInterval(interval);
    }, []);

    if (status === 'connected') {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
                <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md">
                    <div className="text-6xl mb-4">✅</div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">WhatsApp Connected!</h1>
                    <p className="text-gray-600 mb-6">Your WhatsApp is linked. Messages will be synced automatically.</p>
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="bg-green-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-600 transition"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8">
            <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-lg">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Connect WhatsApp</h1>
                <p className="text-gray-600 mb-6">
                    Open WhatsApp on your phone &rarr; Settings &rarr; Linked Devices &rarr; Link a Device
                </p>
                {status === 'loading' ? (
                    <div className="w-64 h-64 mx-auto flex items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500" />
                    </div>
                ) : (
                    <div className="relative mx-auto" style={{ width: 280, height: 280 }}>
                        <iframe
                            key={qrKey}
                            src={`${BRIDGE_URL}/qr`}
                            className="w-full h-full border-0 rounded-xl"
                            title="WhatsApp QR Code"
                            style={{ transform: 'scale(0.75)', transformOrigin: 'top left', width: '373px', height: '373px' }}
                        />
                    </div>
                )}
                <p className="text-sm text-gray-400 mt-4">QR refreshes automatically every 15 seconds</p>
            </div>
        </div>
    );
}
