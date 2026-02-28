'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageSquare, Smartphone, Link2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface Platform {
    id: string;
    name: string;
    type: 'whatsapp' | 'telegram' | 'signal' | 'sms';
    status: 'connected' | 'pending' | 'disconnected';
    messages_synced: number;
    last_sync_at?: string;
}

export default function PlatformsSection() {
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSetup, setShowSetup] = useState<string | null>(null);

    useEffect(() => {
        loadPlatforms();
    }, []);

    async function loadPlatforms() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/platforms', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setPlatforms(data.platforms || []);
        } catch (err) {
            console.error('Failed to load platforms:', err);
        }
        setLoading(false);
    }

    async function connectPlatform(platformType: string) {
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch(`/api/platforms/${platformType}/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            if (data.authUrl) {
                window.location.href = data.authUrl;
            }
        } catch (err) {
            console.error('Failed to connect platform:', err);
        }
    }

    const defaultPlatforms = [
        { type: 'whatsapp', name: 'WhatsApp', icon: MessageSquare },
        { type: 'telegram', name: 'Telegram', icon: Smartphone },
        { type: 'signal', name: 'Signal', icon: Link2 },
        { type: 'sms', name: 'SMS', icon: MessageSquare },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'connected': return 'bg-green-100 text-green-700 border-green-200';
            case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            default: return 'bg-surface-100 text-surface-700 border-surface-200';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'connected': return <CheckCircle className="w-4 h-4" />;
            case 'pending': return <AlertCircle className="w-4 h-4" />;
            default: return <AlertCircle className="w-4 h-4" />;
        }
    };

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-brand-600" />
                Connected Platforms
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {defaultPlatforms.map((platform) => {
                    const connected = platforms.find(p => p.type === platform.type);
                    return (
                        <div key={platform.type} className="bg-white rounded-xl border border-surface-200 p-4">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center">
                                        <platform.icon className="w-5 h-5 text-brand-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-surface-900">{platform.name}</h3>
                                    </div>
                                </div>
                                {connected && (
                                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(connected.status)}`}>
                                        {getStatusIcon(connected.status)}
                                        {connected.status === 'connected' ? 'Connected' : 'Pending'}
                                    </div>
                                )}
                                {!connected && (
                                    <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-surface-100 text-surface-700 border border-surface-200">
                                        <AlertCircle className="w-4 h-4" />
                                        Not Connected
                                    </div>
                                )}
                            </div>

                            {connected ? (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-surface-600">Messages synced:</span>
                                        <span className="font-semibold text-surface-900">{connected.messages_synced}</span>
                                    </div>
                                    {connected.last_sync_at && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-surface-600">Last sync:</span>
                                            <span className="text-surface-500">
                                                {new Date(connected.last_sync_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setShowSetup(showSetup === platform.type ? null : platform.type)}
                                        className="w-full mt-3 px-3 py-2 text-sm font-medium text-surface-700 bg-surface-50 rounded-lg hover:bg-surface-100 transition-colors"
                                    >
                                        Manage
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-xs text-surface-500 mb-3">Connect to sync your messages</p>
                                    <button
                                        onClick={() => setShowSetup(showSetup === platform.type ? null : platform.type)}
                                        className="w-full px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
                                    >
                                        Connect
                                    </button>
                                </div>
                            )}

                            {/* Setup Instructions */}
                            {showSetup === platform.type && (
                                <div className="mt-3 pt-3 border-t border-surface-200">
                                    <div className="bg-surface-50 rounded-lg p-3 space-y-2">
                                        <p className="text-xs font-semibold text-surface-900 mb-2">Setup Instructions</p>
                                        {platform.type === 'whatsapp' && (
                                            <ol className="text-xs text-surface-700 space-y-1 list-decimal list-inside">
                                                <li>Open WhatsApp on your phone</li>
                                                <li>Go to Settings → Linked Devices</li>
                                                <li>Scan the QR code that appears below</li>
                                            </ol>
                                        )}
                                        {platform.type === 'telegram' && (
                                            <ol className="text-xs text-surface-700 space-y-1 list-decimal list-inside">
                                                <li>Click the Connect button</li>
                                                <li>Authorize access to your Telegram account</li>
                                                <li>Your messages will start syncing automatically</li>
                                            </ol>
                                        )}
                                        {platform.type === 'signal' && (
                                            <ol className="text-xs text-surface-700 space-y-1 list-decimal list-inside">
                                                <li>Open Signal on your computer</li>
                                                <li>Go to Settings → Linked Devices</li>
                                                <li>Scan the QR code shown below</li>
                                            </ol>
                                        )}
                                        {platform.type === 'sms' && (
                                            <ol className="text-xs text-surface-700 space-y-1 list-decimal list-inside">
                                                <li>Grant permission to access SMS</li>
                                                <li>Existing messages will be imported</li>
                                                <li>New messages sync automatically</li>
                                            </ol>
                                        )}
                                        {!connected && (
                                            <button
                                                onClick={() => connectPlatform(platform.type)}
                                                className="w-full mt-2 px-3 py-2 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700"
                                            >
                                                Proceed with Setup
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
