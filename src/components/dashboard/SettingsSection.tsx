'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Users, Bell, Shield, Download, Loader2, ToggleRight, ToggleLeft,
  X, Plus, Wifi, WifiOff, RefreshCw, Smartphone, QrCode, CheckCircle2, LogOut
} from 'lucide-react';

const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL || 'https://chatvault-ai-production.up.railway.app';

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

interface WhatsAppStatus {
  connected: boolean;
  status: string;
  phone?: string;
  name?: string;
  sync?: any;
}

export default function SettingsSection() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newZone, setNewZone] = useState('');
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({ connected: false, status: 'disconnected' });
  const [waLoading, setWaLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    loadSettings();
    checkWhatsApp();
    const interval = setInterval(checkWhatsApp, 5000);
    return () => clearInterval(interval);
  }, []);

  async function checkWhatsApp() {
    try {
      const res = await fetch(BRIDGE_URL + '/status');
      if (res.ok) {
        const data = await res.json();
        setWaStatus({
          connected: data.connected || data.status === 'connected',
          status: data.status || 'disconnected',
          phone: data.phone,
          name: data.name,
          sync: data.sync,
        });
        if (data.connected || data.status === 'connected') {
          setShowQR(false);
        }
      }
    } catch (err) {
      setWaStatus({ connected: false, status: 'error' });
    }
    setWaLoading(false);
  }

  async function loadSettings() {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const userEmail = session.data.session?.user?.email || '';
      const userName = session.data.session?.user?.user_metadata?.full_name || session.data.session?.user?.user_metadata?.name || '';
      const response = await fetch('/api/settings', {
        headers: { 'Authorization': 'Bearer ' + (session.data.session?.access_token || '') },
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
          'Authorization': 'Bearer ' + (session.data.session?.access_token || ''),
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
    await saveSettings({ privacy_zones: updatedZones } as any);
    setNewZone('');
  }

  async function removePrivacyZone(zone: string) {
    if (!settings) return;
    const updatedZones = (settings.privacy_zones || []).filter((z: any) => z !== zone);
    await saveSettings({ privacy_zones: updatedZones } as any);
  }

  async function handleExport() {
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch('/api/export', {
        headers: { 'Authorization': 'Bearer ' + (session.data.session?.access_token || '') },
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rememora-export-' + new Date().toISOString() + '.json';
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
        <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 max-w-2xl p-6">
        <h2 className="text-xl font-bold text-surface-900">Settings</h2>

        {/* WhatsApp Connection Section */}
        <div className="bg-white rounded-xl border border-surface-200 p-6">
          <h3 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-brand-600" />
            WhatsApp Connection
          </h3>

          {waLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
              <span className="ml-2 text-sm text-surface-500">Checking connection...</span>
            </div>
          ) : waStatus.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-brand-50 rounded-lg border border-brand-200">
                <CheckCircle2 className="w-8 h-8 text-brand-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-brand-600">WhatsApp Connected</p>
                  <p className="text-sm text-brand-600">
                    {waStatus.phone ? ('Phone: ' + waStatus.phone) : 'Bridge is active'}
                    {waStatus.name ? (' \u2022 ' + waStatus.name) : ''}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <Wifi className="w-4 h-4 text-brand-600" />
                </div>
              </div>
              {waStatus.sync && (
                <div className="text-xs text-surface-500 space-y-1">
                  <p>Messages synced: {waStatus.sync.messages || 0}</p>
                  <p>Chats: {waStatus.sync.chats || 0} \u2022 Contacts: {waStatus.sync.contacts || 0}</p>
                  {waStatus.sync.inProgress && (
                    <p className="text-amber-600 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Sync in progress...
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <WifiOff className="w-6 h-6 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-amber-800">WhatsApp Not Connected</p>
                  <p className="text-sm text-amber-600">Connect your WhatsApp to start syncing messages</p>
                </div>
              </div>

              {!showQR ? (
                <button
                  onClick={() => setShowQR(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition-colors"
                >
                  <QrCode className="w-5 h-5" />
                  Connect WhatsApp
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="bg-surface-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-surface-600 mb-3">
                      Open WhatsApp {'>'} Linked Devices {'>'} Link a Device
                    </p>
                    <div className="flex justify-center">
                      <iframe
                        src={BRIDGE_URL + '/qr?embed=1'}
                        className="w-[280px] h-[280px] rounded-lg border-2 border-brand-200"
                        title="WhatsApp QR Code"
                      />
                    </div>
                    <p className="text-xs text-surface-400 mt-3">QR code refreshes automatically</p>
                  </div>
                  <button
                    onClick={() => setShowQR(false)}
                    className="w-full px-4 py-2 text-sm text-surface-600 hover:text-surface-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile Section */}
        {settings && (
          <>
            <div className="bg-white rounded-xl border border-surface-200 p-6">
              <h3 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-600" />
                Profile
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-surface-600">Display Name</label>
                  <input
                    type="text"
                    value={settings.display_name}
                    onChange={(e: any) => setSettings({ ...settings, display_name: e.target.value })}
                    onBlur={() => saveSettings({ display_name: settings.display_name })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-200 text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-surface-600">Email</label>
                  <input
                    type="email"
                    value={settings.email}
                    disabled
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-200 text-surface-600 bg-surface-50"
                  />
                </div>
                <div>
                  <label className="text-sm text-surface-600">Timezone</label>
                  <select
                    value={settings.timezone}
                    onChange={(e: any) => {
                      setSettings({ ...settings, timezone: e.target.value });
                      saveSettings({ timezone: e.target.value });
                    }}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-surface-200 text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
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

            {/* Notifications */}
            <div className="bg-white rounded-xl border border-surface-200 p-6">
              <h3 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5 text-brand-600" />
                Notifications
              </h3>
              <div className="space-y-4">
                {[{
                  key: 'daily_summary' as const,
                  title: 'Daily Summary',
                  desc: 'Get daily message summaries',
                }, {
                  key: 'weekly_summary' as const,
                  title: 'Weekly Summary',
                  desc: 'Get weekly message summaries',
                }, {
                  key: 'commitment_alerts' as const,
                  title: 'Commitment Alerts',
                  desc: 'Get alerted when commitments are due',
                }].map((item, idx) => (
                  <div key={item.key} className={'flex items-center justify-between' + (idx > 0 ? ' pt-2 border-t border-surface-100' : '')}>
                    <div>
                      <p className="text-surface-900 font-medium">{item.title}</p>
                      <p className="text-sm text-surface-600">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => saveSettings({ [item.key]: !settings[item.key] })}
                      className={'px-3 py-1 rounded-lg text-sm font-medium transition-colors ' + (settings[item.key] ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-surface-700')}
                    >
                      {settings[item.key] ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Privacy */}
            <div className="bg-white rounded-xl border border-surface-200 p-6">
              <h3 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-brand-600" />
                Privacy
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-surface-900 font-medium mb-2">Privacy Zones</p>
                  <p className="text-sm text-surface-600 mb-3">Messages containing these keywords will not be indexed</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(settings.privacy_zones || []).map((zone: any) => (
                      <div key={zone} className="flex items-center gap-2 bg-surface-100 text-surface-700 px-3 py-1 rounded-full text-sm">
                        {zone}
                        <button onClick={() => removePrivacyZone(zone)} className="hover:text-red-600">
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
                      className="flex-1 px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button onClick={addPrivacyZone} className="px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="pt-4 border-t border-surface-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-surface-900 font-medium">Data Retention</p>
                      <p className="text-sm text-surface-600">Delete old messages after</p>
                    </div>
                    <select
                      value={settings.data_retention_days}
                      onChange={(e: any) => {
                        const days = parseInt(e.target.value);
                        setSettings({ ...settings, data_retention_days: days });
                        saveSettings({ data_retention_days: days });
                      }}
                      className="px-3 py-2 rounded-lg border border-surface-200 text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
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

            {/* Data Export */}
            <div className="bg-white rounded-xl border border-surface-200 p-6">
              <h3 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
                <Download className="w-5 h-5 text-brand-600" />
                Data Export
              </h3>
              <p className="text-sm text-surface-600 mb-4">Download all your data as a JSON file</p>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export Data
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
