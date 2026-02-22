'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Bell, Shield, Download, Loader2, ToggleRight, ToggleLeft, X, Plus } from 'lucide-react';

interface SettingsData {
    display_name: string;
    email: string;
    timezone: string;
    daily_summary: boolean;
    weekly_summary: boolean;
    commitment_alerts: boolean;
    privacy_zones: any[];
    data_retention_days: number;
}

export default function SettingsSection() {
    const [settings, setSettings] = useState<SettingsData | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newZone, setNewZone] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const userEmail = session.data.session?.user?.email || '';
            const userName = session.data.session?.user?.user_metadata?.full_name || session.data.session?.user?.user_metadata?.name || '';
            const response = await fetch('/api/settings', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setSettings({
                display_name: data.profile?.displayName || userName || userEmail.split('@')[0] || '',
                email: data.profile?.email || userEmail,
                timezone: data.profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                daily_summary: data.notifications?.dailySummary ?? false,
                weekly_summary: data.notifications?.weeklySummary ?? false,
                commitment_alerts: data.notifications?.commitmentAlerts ?? true,
                privacy_zones: data.privacyZones || [],
                data_retention_days: data.profile?.dataRetentionDays || 365,
            });
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
        setLoading(false);
    }

    async function saveSettings(updates: Partial<SettingsData>) {
        if (!settings) return;
        setSaving(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({
                    displayName: updates.display_name,
                    timezone: updates.timezone,
                    dataRetentionDays: updates.data_retention_days,
                    notifications: {
                        daily_summary: updates.daily_summary,
                        weekly_summary: updates.weekly_summary,
                        commitment_alerts: updates.commitment_alerts,
                    },
                }),
            });
            const data = await response.json();
            setSettings({
                display_name: data.profile?.displayName || '',
                email: data.profile?.email || '',
                timezone: data.profile?.timezone || 'UTC',
                daily_summary: data.notifications?.dailySummary ?? false,
                weekly_summary: data.notifications?.weeklySummary ?? false,
                commitment_alerts: data.notifications?.commitmentAlerts ?? true,
                privacy_zones: data.privacyZones || [],
                data_retention_days: data.profile?.dataRetentionDays || 365,
            });
        } catch (err) {
            console.error('Failed to save settings:', err);
        }
        setSaving(false);
    }

    async function addPrivacyZone() {
        if (!settings || !newZone.trim()) return;
        const updatedZones = [...(settings.privacy_zones || []), newZone];
        await saveSettings({ privacy_zones: updatedZones });
        setNewZone('');
    }

    async function removePrivacyZone(zone: string) {
        if (!settings) return;
        const updatedZones = (settings.privacy_zones || []).filter((z: any) => z !== zone);
        await saveSettings({ privacy_zones: updatedZones });
    }

    async function handleExport() {
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/export', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `rememora-export-${new Date().toISOString()}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Failed to export:', err);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
                Failed to load settings
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            {/* Profile Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-green-600" />
                    Profile
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm text-gray-600">Display Name</label>
                        <input
                            type="text"
                            value={settings.display_name}
                            onChange={(e: any) => setSettings({ ...settings, display_name: e.target.value })}
                            onBlur={() => saveSettings({ display_name: settings.display_name })}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600">Email</label>
                        <input
                            type="email"
                            value={settings.email}
                            disabled
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 bg-gray-50"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600">Timezone</label>
                        <select
                            value={settings.timezone}
                            onChange={(e: any) => {
                                setSettings({ ...settings, timezone: e.target.value });
                                saveSettings({ timezone: e.target.value });
                            }}
                            className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                            <option>UTC</option>
                            <option>US/Eastern</option>
                            <option>US/Central</option>
                            <option>US/Mountain</option>
                            <option>US/Pacific</option>
                            <option>Europe/London</option>
                            <option>Europe/Paris</option>
                            <option>Asia/Tokyo</option>
                            <option>Asia/Hong_Kong</option>
                            <option>Australia/Sydney</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Notifications Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-green-600" />
                    Notifications
                </h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-900 font-medium">Daily Summary</p>
                            <p className="text-sm text-gray-600">Get daily message summaries</p>
                        </div>
                        <button
                            onClick={() => saveSettings({ daily_summary: !settings.daily_summary })}
                            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                settings.daily_summary
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                            {settings.daily_summary ? (
                                <ToggleRight className="w-5 h-5" />
                            ) : (
                                <ToggleLeft className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <div>
                            <p className="text-gray-900 font-medium">Weekly Summary</p>
                            <p className="text-sm text-gray-600">Get weekly message summaries</p>
                        </div>
                        <button
                            onClick={() => saveSettings({ weekly_summary: !settings.weekly_summary })}
                            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                settings.weekly_summary
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                            {settings.weekly_summary ? (
                                <ToggleRight className="w-5 h-5" />
                            ) : (
                                <ToggleLeft className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <div>
                            <p className="text-gray-900 font-medium">Commitment Alerts</p>
                            <p className="text-sm text-gray-600">Get alerted when commitments are due</p>
                        </div>
                        <button
                            onClick={() => saveSettings({ commitment_alerts: !settings.commitment_alerts })}
                            className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                                settings.commitment_alerts
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                            {settings.commitment_alerts ? (
                                <ToggleRight className="w-5 h-5" />
                            ) : (
                                <ToggleLeft className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Privacy Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-green-600" />
                    Privacy
                </h3>
                <div className="space-y-4">
                    <div>
                        <p className="text-gray-900 font-medium mb-2">Privacy Zones</p>
                        <p className="text-sm text-gray-600 mb-3">
                            Messages containing these keywords will not be indexed or searched
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {(settings.privacy_zones || []).map((zone: any) => (
                                <div
                                    key={zone}
                                    className="flex items-center gap-2 bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
                                >
                                    {zone}
                                    <button
                                        onClick={() => removePrivacyZone(zone)}
                                        className="hover:text-red-600"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newZone}
                                onChange={(e: any) => setNewZone(e.target.value)}
                                placeholder="Add privacy zone keyword..."
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <button
                                onClick={addPrivacyZone}
                                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-gray-900 font-medium">Data Retention</p>
                                <p className="text-sm text-gray-600">Delete old messages after</p>
                            </div>
                            <select
                                value={settings.data_retention_days}
                                onChange={(e: any) => {
                                    const days = parseInt(e.target.value);
                                    setSettings({ ...settings, data_retention_days: days });
                                    saveSettings({ data_retention_days: days });
                                }}
                                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                            >
                                <option value="30">30 days</option>
                                <option value="90">90 days</option>
                                <option value="180">180 days</option>
                                <option value="365">1 year</option>
                                <option value="999999">Never</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Data Export Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Download className="w-5 h-5 text-green-600" />
                    Data Export
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                    Download all your messages, chats, and metadata as a JSON file
                </p>
                <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2"
                >
                    <Download className="w-4 h-4" />
                    Export Data
                </button>
            </div>
        </div>
    );
}
