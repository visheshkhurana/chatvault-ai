'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FileBarChart, Loader2, Download } from 'lucide-react';

export default function ReportsSection() {
    const [reportType, setReportType] = useState<'analytics' | 'chat_summary' | 'contact' | 'full'>('analytics');
    const [period, setPeriod] = useState('30d');
    const [loading, setLoading] = useState(false);
    const [reportHtml, setReportHtml] = useState<string | null>(null);
    const [chats, setChats] = useState<any[]>([]);
    const [selectedChat, setSelectedChat] = useState('');

    useEffect(() => {
        async function loadChats() {
            const { data } = await supabase.from('chats').select('id, title').order('last_message_at', { ascending: false });
            setChats(data || []);
        }
        loadChats();
    }, []);

    async function generateReport() {
        setLoading(true);
        setReportHtml(null);
        try {
            const session = await supabase.auth.getSession();
            const body: any = { type: reportType, period, format: 'html' };
            if (reportType === 'chat_summary' && selectedChat) body.chatId = selectedChat;
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            setReportHtml(data.html || '<p>Report generation failed</p>');
        } catch (err) { console.error(err); }
        setLoading(false);
    }

    function printReport() {
        if (!reportHtml) return;
        const win = window.open('', '_blank');
        if (win) { win.document.write(reportHtml); win.document.close(); win.print(); }
    }

    return (
        <div>
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                    <FileBarChart className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-surface-900">Reports</h2>
                    <p className="text-sm text-surface-500">Generate beautiful, printable reports from your data</p>
                </div>
            </div>

            <div className="bg-white border border-surface-200 rounded-xl p-5 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {[
                        { id: 'analytics', label: 'Analytics Report', icon: '📊' },
                        { id: 'chat_summary', label: 'Chat Summary', icon: '💬' },
                        { id: 'contact', label: 'Contact Report', icon: '👤' },
                        { id: 'full', label: 'Full Report', icon: '📋' },
                    ].map((r) => (
                        <button key={r.id} onClick={() => setReportType(r.id as any)} className={`p-3 rounded-xl text-sm font-medium text-center border transition-colors ${reportType === r.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-200 text-surface-600 hover:bg-surface-50'}`}>
                            <span className="text-lg block mb-1">{r.icon}</span>
                            {r.label}
                        </button>
                    ))}
                </div>

                <div className="flex gap-3">
                    <div className="flex bg-surface-100 rounded-xl p-0.5">
                        {['7d', '30d', '90d'].map((p) => (
                            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-2 rounded-lg text-xs font-medium ${period === p ? 'bg-white shadow-sm text-surface-900' : 'text-surface-500'}`}>{p}</button>
                        ))}
                    </div>
                    {reportType === 'chat_summary' && (
                        <select value={selectedChat} onChange={(e: any) => setSelectedChat(e.target.value)} className="flex-1 px-3 py-2 border border-surface-200 rounded-xl text-sm bg-white">
                            <option value="">Select a chat...</option>
                            {chats.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                    )}
                    <button onClick={generateReport} disabled={loading} className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileBarChart className="w-4 h-4" />}
                        Generate
                    </button>
                </div>
            </div>

            {reportHtml && (
                <div>
                    <div className="flex justify-end gap-2 mb-3">
                        <button onClick={printReport} className="px-4 py-2 border border-surface-200 rounded-xl text-sm font-medium text-surface-700 hover:bg-surface-50 flex items-center gap-2">
                            <Download className="w-4 h-4" /> Print / Save PDF
                        </button>
                    </div>
                    <div className="bg-white border border-surface-200 rounded-xl overflow-hidden">
                        <iframe srcDoc={reportHtml} className="w-full h-[600px] border-0" title="Report Preview" />
                    </div>
                </div>
            )}
        </div>
    );
}
