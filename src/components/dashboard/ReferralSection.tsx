'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface ReferralData {
  referralCode: string;
  referralLink: string;
  stats: {
    totalReferred: number;
    signedUp: number;
    activated: number;
    rewarded: number;
    totalProDaysEarned: number;
  };
  referrals: {
    id: string;
    referred_email: string;
    status: string;
    reward_type: string;
    reward_amount: number;
    created_at: string;
  }[];
}

export default function ReferralSection() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);



  const fetchReferrals = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/referrals', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.data) setData(json.data);
    } catch (err) {
      console.error('Failed to fetch referrals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  const copyLink = async () => {
    if (!data?.referralLink) return;
    try {
      await navigator.clipboard.writeText(data.referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = data.referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const json = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: 'Referral tracked! Share your link with them.' });
        setInviteEmail('');
        fetchReferrals();
      } else {
        setMessage({ type: 'error', text: json.error || 'Failed to send invite' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Something went wrong' });
    } finally {
      setInviting(false);
    }
  };

  const shareViaWhatsApp = () => {
    if (!data?.referralLink) return;
    const text = encodeURIComponent(
      `Hey! I've been using Rememora to search and organize my WhatsApp messages with AI. Try it out: ${data.referralLink}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
      signed_up: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Signed Up' },
      activated: { bg: 'bg-green-100', text: 'text-green-800', label: 'Activated' },
      rewarded: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Rewarded' },
    };
    const s = styles[status] || styles.pending;
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Refer Friends</h2>
          <p className="text-sm text-gray-500">Earn 7 days of Pro for each friend who joins</p>
        </div>
      </div>

      {/* Reward Banner */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">Give 7 days, Get 7 days</h3>
            <p className="text-indigo-100 mt-1 text-sm">
              Your friends get 7 days of Pro free. When they activate, you earn 7 days too!
            </p>
          </div>
          <div className="text-4xl">🎁</div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mt-5">
          <div className="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
            <div className="text-2xl font-bold">{data?.stats.totalReferred || 0}</div>
            <div className="text-xs text-indigo-100">Invited</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
            <div className="text-2xl font-bold">{data?.stats.activated || 0}</div>
            <div className="text-xs text-indigo-100">Activated</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center backdrop-blur-sm">
            <div className="text-2xl font-bold">{data?.stats.totalProDaysEarned || 0}</div>
            <div className="text-xs text-indigo-100">Days Earned</div>
          </div>
        </div>
      </div>

      {/* Share Link */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Your Referral Link</h3>
        <div className="flex gap-2">
          <div className="flex-1 bg-gray-50 rounded-lg px-4 py-2.5 text-sm text-gray-600 font-mono truncate border border-gray-200">
            {data?.referralLink || '...'}
          </div>
          <button
            onClick={copyLink}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              copied
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* Share buttons */}
        <div className="flex gap-2">
          <button
            onClick={shareViaWhatsApp}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.626-1.467A11.932 11.932 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-2.156 0-4.154-.688-5.787-1.856l-.415-.296-2.745.871.878-2.683-.322-.433A9.717 9.717 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75z" />
            </svg>
            Share via WhatsApp
          </button>
          <button
            onClick={() => {
              const subject = encodeURIComponent('Try Rememora - AI for WhatsApp');
              const body = encodeURIComponent(
                `Hey! I've been using Rememora to search and organize my WhatsApp messages with AI. You should try it!\n\n${data?.referralLink}`
              );
              window.open(`mailto:?subject=${subject}&body=${body}`);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email
          </button>
        </div>
      </div>

      {/* Invite by Email */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">Invite by Email</h3>
        <p className="text-sm text-gray-500">Track who you&apos;ve invited and their status</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
            placeholder="friend@example.com"
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            onClick={sendInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {inviting ? 'Sending...' : 'Invite'}
          </button>
        </div>

        {message && (
          <div className={`px-4 py-2 rounded-lg text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}
      </div>

      {/* Referral History */}
      {data?.referrals && data.referrals.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Referral History</h3>
          <div className="divide-y divide-gray-100">
            {data.referrals.map((ref) => (
              <div key={ref.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {ref.referred_email}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(ref.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ref.status === 'rewarded' && (
                    <span className="text-xs text-purple-600 font-medium">
                      +{ref.reward_amount} days
                    </span>
                  )}
                  {getStatusBadge(ref.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="bg-gray-50 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">How It Works</h3>
        <div className="space-y-3">
          {[
            { step: '1', icon: '📤', title: 'Share your link', desc: 'Send your unique referral link to friends' },
            { step: '2', icon: '📱', title: 'They sign up', desc: 'Your friend creates an account using your link' },
            { step: '3', icon: '🔗', title: 'They connect WhatsApp', desc: 'They connect their WhatsApp and start using Rememora' },
            { step: '4', icon: '🎉', title: 'You both earn Pro', desc: 'You each get 7 days of Pro features free!' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {item.step}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">{item.icon} {item.title}</div>
                <div className="text-xs text-gray-500">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
