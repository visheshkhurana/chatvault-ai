'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Smartphone, CheckCircle2, Loader2, ArrowRight, RefreshCw, Wifi } from 'lucide-react';

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
            setQrKey((k: number) => k + 1);
        }, 15000);

        return () => clearInterval(interval);
    }, []);

    if (status === 'connected') {
        return (
            <div className="min-h-screen bg-surface-50 flex items-center justify-center p-6">
                <div className="max-w-md w-full text-center animate-slide-up">
                    {/* Success card */}
                    <div className="bg-white rounded-2xl shadow-xl shadow-surface-900/5 border border-surface-100 p-10">
                        <div className="w-20 h-20 bg-brand-50 border-2 border-brand-200 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle2 className="w-10 h-10 text-brand-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-surface-900 mb-2">WhatsApp Connected!</h1>
                        <p className="text-surface-500 mb-8">
                            Your WhatsApp is linked and messages will sync automatically in the background.
                        </p>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="btn-primary w-full flex items-center justify-center gap-2"
                        >
                            Go to Dashboard <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center justify-center gap-2 mt-6 text-sm text-surface-400">
                        <Wifi className="w-4 h-4 text-brand-500" />
                        <span>Syncing messages in real-time</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-50 flex items-center justify-center p-6">
            <div className="max-w-lg w-full animate-slide-up">
                {/* Connect card */}
                <div className="bg-white rounded-2xl shadow-xl shadow-surface-900/5 border border-surface-100 overflow-hidden">
                    {/* Header */}
                    <div className="bg-surface-900 p-8 text-center relative overflow-hidden">
                        <div className="absolute inset-0">
                            <div className="absolute top-0 right-0 w-40 h-40 bg-brand-500/10 rounded-full blur-3xl" />
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-brand-400/10 rounded-full blur-2xl" />
                        </div>
                        <div className="relative">
                            <div className="w-14 h-14 bg-gradient-to-br from-brand-400 to-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-500/30">
                                <MessageSquare className="w-7 h-7 text-white" />
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-1">Connect WhatsApp</h1>
                            <p className="text-surface-400 text-sm">Link your account to start syncing</p>
                        </div>
                    </div>

                    {/* QR Code section */}
                    <div className="p-8">
                        {/* Steps */}
                        <div className="space-y-3 mb-8">
                            {[
                                'Open WhatsApp on your phone',
                                'Go to Settings → Linked Devices',
                                'Tap "Link a Device" and scan the QR code',
                            ].map((step, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <div className="w-6 h-6 bg-brand-50 border border-brand-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <span className="text-xs font-bold text-brand-600">{i + 1}</span>
                                    </div>
                                    <span className="text-sm text-surface-600">{step}</span>
                                </div>
                            ))}
                        </div>

                        {/* QR Display */}
                        <div className="relative">
                            {status === 'loading' ? (
                                <div className="w-full aspect-square max-w-[280px] mx-auto flex items-center justify-center bg-surface-50 rounded-2xl border border-surface-200">
                                    <div className="text-center">
                                        <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto mb-2" />
                                        <p className="text-sm text-surface-400">Loading QR code...</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="relative max-w-[280px] mx-auto">
                                    <div className="bg-white rounded-2xl border-2 border-surface-200 p-3 shadow-inner">
                                        <iframe
                                            key={qrKey}
                                            src={`${BRIDGE_URL}/qr?embed=1`}
                                            className="w-full aspect-square border-0 rounded-xl"
                                            title="WhatsApp QR Code"
                                        />
                                    </div>
                                    {/* Corner decorations */}
                                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-brand-500 rounded-tl-lg" />
                                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-brand-500 rounded-tr-lg" />
                                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-brand-500 rounded-bl-lg" />
                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-brand-500 rounded-br-lg" />
                                </div>
                            )}
                        </div>

                        {/* Refresh hint */}
                        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-surface-400">
                            <RefreshCw className="w-3 h-3" />
                            <span>QR code refreshes automatically every 15 seconds</span>
                        </div>
                    </div>
                </div>

                {/* Phone illustration hint */}
                <div className="flex items-center justify-center gap-2 mt-6 text-sm text-surface-400">
                    <Smartphone className="w-4 h-4" />
                    <span>Keep your phone connected to the internet</span>
                </div>
            </div>
        </div>
    );
}
