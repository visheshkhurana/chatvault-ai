'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Plus, Loader2, Copy, Trash2, CheckSquare } from 'lucide-react';

interface Template {
    id: string;
    name: string;
    content: string;
    category: string;
    variables: string[];
    use_count: number;
    last_used_at: string;
}

export default function TemplatesSection() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newContent, setNewContent] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => { loadTemplates(); }, []);

    async function loadTemplates() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const res = await fetch('/api/templates', { headers: { 'Authorization': `Bearer ${session.data.session?.access_token}` } });
            const data = await res.json();
            setTemplates(data.templates || []);
        } catch (err) { console.error(err); }
        setLoading(false);
    }

    async function createTemplate() {
        if (!newName.trim() || !newContent.trim()) return;
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ name: newName, content: newContent, category: newCategory || 'general' }),
            });
            setNewName(''); setNewContent(''); setNewCategory(''); setShowForm(false);
            loadTemplates();
        } catch (err) { console.error(err); }
    }

    async function deleteTemplate(id: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch('/api/templates', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.data.session?.access_token}` },
                body: JSON.stringify({ id }),
            });
            loadTemplates();
        } catch (err) { console.error(err); }
    }

    function copyToClipboard(content: string, id: string) {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                        <FileText className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-surface-900">Message Templates</h2>
                        <p className="text-sm text-surface-500">Save and reuse your most common messages</p>
                    </div>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> New Template
                </button>
            </div>

            {showForm && (
                <div className="bg-white border border-surface-200 rounded-xl p-5 mb-6">
                    <div className="space-y-3">
                        <input value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="Template name" className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        <textarea value={newContent} onChange={(e: any) => setNewContent(e.target.value)} placeholder="Template content... use {{name}} for variables" rows={4} className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
                        <div className="flex gap-3">
                            <input value={newCategory} onChange={(e: any) => setNewCategory(e.target.value)} placeholder="Category (optional)" className="flex-1 px-3 py-2.5 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                            <button onClick={createTemplate} className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700">Save</button>
                            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 border border-surface-200 rounded-xl text-sm text-surface-600 hover:bg-surface-50">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-surface-400" /></div>
            ) : templates.length === 0 ? (
                <div className="text-center py-16 text-surface-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No templates yet</p>
                    <p className="text-sm">Create your first template to save time on repetitive messages</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {templates.map((t) => (
                        <div key={t.id} className="bg-white border border-surface-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <h3 className="font-semibold text-surface-900">{t.name}</h3>
                                    <span className="text-xs px-2 py-0.5 bg-surface-100 text-surface-500 rounded-full">{t.category || 'general'}</span>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => copyToClipboard(t.content, t.id)} className="p-1.5 hover:bg-surface-100 rounded-lg" title="Copy">
                                        {copiedId === t.id ? <CheckSquare className="w-4 h-4 text-brand-500" /> : <Copy className="w-4 h-4 text-surface-400" />}
                                    </button>
                                    <button onClick={() => deleteTemplate(t.id)} className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4 text-surface-400 hover:text-red-500" /></button>
                                </div>
                            </div>
                            <p className="text-sm text-surface-600 whitespace-pre-wrap">{t.content}</p>
                            <div className="flex items-center gap-3 mt-3 text-xs text-surface-400">
                                <span>Used {t.use_count || 0} times</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
