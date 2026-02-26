'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckSquare, Loader2, AlertTriangle, Clock } from 'lucide-react';

interface Commitment {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'overdue' | 'done';
    due_date: string;
    priority: 'low' | 'medium' | 'high';
    contact_id: string;
}

export default function CommitmentsSection() {
    const [commitments, setCommitments] = useState<Commitment[]>([]);
    const [scanning, setScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);

    useEffect(() => {
        loadCommitments();
    }, []);

    async function loadCommitments() {
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/commitments', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setCommitments(data.commitments || []);
        } catch (err) {
            console.error('Failed to load commitments:', err);
        }
    }

    async function scanForCommitments() {
        setScanning(true);
        setScanResult(null);
        setScanError(null);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/commitments/scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ scanDays: 7 }),
            });
            const data = await response.json();
            if (!response.ok) {
                setScanError(data.error || 'Scan failed');
            } else {
                setScanResult(data.message || `Found ${data.created || 0} new commitments`);
                await loadCommitments();
            }
        } catch (err) {
            console.error('Failed to scan commitments:', err);
            setScanError('Failed to scan commitments. Please try again.');
        }
        setScanning(false);
    }

    async function markAsDone(commitmentId: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/commitments/${commitmentId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify({ status: 'done' }),
            });
            await loadCommitments();
        } catch (err) {
            console.error('Failed to mark commitment as done:', err);
        }
    }

    const grouped = {
        overdue: commitments.filter((c: any) => c.status === 'overdue'),
        pending: commitments.filter((c: any) => c.status === 'pending'),
        done: commitments.filter((c: any) => c.status === 'done'),
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high':
                return 'bg-red-100 text-red-700';
            case 'medium':
                return 'bg-yellow-100 text-yellow-700';
            case 'low':
                return 'bg-blue-100 text-blue-700';
            default:
                return 'bg-surface-100 text-surface-700';
        }
    };

    const getPriorityIcon = (priority: string) => {
        switch (priority) {
            case 'high':
                return <AlertTriangle className="w-3 h-3" />;
            case 'medium':
                return <Clock className="w-3 h-3" />;
            default:
                return null;
        }
    };

    return (
        <div>
            {/* Header with Scan Button */}
            <div className="mb-6">
                <button
                    onClick={scanForCommitments}
                    disabled={scanning}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
                >
                    {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
                    Scan for Commitments
                </button>
                {scanError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                        {scanError}
                    </div>
                )}
                {scanResult && (
                    <div className="mt-3 p-3 bg-brand-50 border border-brand-200 text-brand-700 rounded-lg text-sm">
                        {scanResult}
                    </div>
                )}
            </div>

            {/* Commitments by Status */}
            <div className="space-y-6">
                {/* Overdue */}
                {grouped.overdue.length > 0 && (
                    <div>
                        <h3 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                            Overdue ({grouped.overdue.length})
                        </h3>
                        <div className="space-y-3">
                            {grouped.overdue.map((commitment: any) => (
                                <div key={commitment.id} className="bg-white rounded-xl border border-surface-200 p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <h4 className="font-medium text-surface-900">{commitment.title}</h4>
                                            <p className="text-sm text-surface-600 mt-1">{commitment.description}</p>
                                        </div>
                                        <button
                                            onClick={() => markAsDone(commitment.id)}
                                            className="px-3 py-1 bg-brand-100 text-brand-700 rounded-lg text-sm font-medium hover:bg-brand-200"
                                        >
                                            Mark Done
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3 mt-3">
                                        <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${getPriorityColor(commitment.priority)}`}>
                                            {getPriorityIcon(commitment.priority)}
                                            {commitment.priority}
                                        </span>
                                        <span className="text-xs text-red-600 font-medium">
                                            Due: {new Date(commitment.due_date).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Pending */}
                {grouped.pending.length > 0 && (
                    <div>
                        <h3 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-yellow-600" />
                            Pending ({grouped.pending.length})
                        </h3>
                        <div className="space-y-3">
                            {grouped.pending.map((commitment: any) => (
                                <div key={commitment.id} className="bg-white rounded-xl border border-surface-200 p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <h4 className="font-medium text-surface-900">{commitment.title}</h4>
                                            <p className="text-sm text-surface-600 mt-1">{commitment.description}</p>
                                        </div>
                                        <button
                                            onClick={() => markAsDone(commitment.id)}
                                            className="px-3 py-1 bg-brand-100 text-brand-700 rounded-lg text-sm font-medium hover:bg-brand-200"
                                        >
                                            Mark Done
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3 mt-3">
                                        <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${getPriorityColor(commitment.priority)}`}>
                                            {getPriorityIcon(commitment.priority)}
                                            {commitment.priority}
                                        </span>
                                        <span className="text-xs text-surface-500">
                                            Due: {new Date(commitment.due_date).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Done */}
                {grouped.done.length > 0 && (
                    <div>
                        <h3 className="font-semibold text-surface-900 mb-4 flex items-center gap-2">
                            <CheckSquare className="w-5 h-5 text-brand-600" />
                            Completed ({grouped.done.length})
                        </h3>
                        <div className="space-y-3">
                            {grouped.done.map((commitment: any) => (
                                <div key={commitment.id} className="bg-surface-50 rounded-xl border border-surface-200 p-4 opacity-75">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <h4 className="font-medium text-surface-900 line-through">{commitment.title}</h4>
                                            <p className="text-sm text-surface-600 mt-1">{commitment.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 mt-3">
                                        <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${getPriorityColor(commitment.priority)}`}>
                                            {getPriorityIcon(commitment.priority)}
                                            {commitment.priority}
                                        </span>
                                        <span className="text-xs text-surface-500">
                                            Due: {new Date(commitment.due_date).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {Object.values(grouped).every((arr) => arr.length === 0) && (
                    <div className="bg-white rounded-xl border border-surface-200 p-12 text-center text-surface-500">
                        No commitments found. Click "Scan for Commitments" to find commitments in your messages.
                    </div>
                )}
            </div>
        </div>
    );
}
