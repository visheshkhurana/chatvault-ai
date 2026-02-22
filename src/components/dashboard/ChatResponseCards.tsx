'use client';

import { useState } from 'react';
import { FileText, CheckSquare, Clock, AlertTriangle, ChevronDown, ChevronUp, MessageSquare, User, Calendar } from 'lucide-react';

// ============================================================
// Rich Response Cards for Chat Assistant
// ============================================================

interface MessageSource {
    chatId: string;
    text: string;
    senderName?: string;
    timestamp?: string;
    chatTitle?: string;
}

interface Commitment {
    id: string;
    title: string;
    committed_by: string;
    due_date?: string;
    priority?: string;
    status: string;
    chat_id?: string;
    created_at?: string;
}

interface SummaryData {
    text: string;
    keyTopics: string[];
    actionItems: string[];
}

// --- Search Sources Card ---

export function SearchSourcesCard({ sources }: { sources: MessageSource[] }) {
    const [expanded, setExpanded] = useState(false);
    const displaySources = expanded ? sources : sources.slice(0, 3);

    if (sources.length === 0) return null;

    return (
        <div className="mt-2">
            <div className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Sources ({sources.length})
            </div>
            <div className="space-y-1.5">
                {displaySources.map((source, i) => (
                    <div
                        key={i}
                        className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs"
                    >
                        <div className="flex items-center gap-2 mb-0.5">
                            {source.senderName && (
                                <span className="font-medium text-gray-800 flex items-center gap-1">
                                    <User className="w-3 h-3 text-gray-400" />
                                    {source.senderName}
                                </span>
                            )}
                            {source.chatTitle && (
                                <span className="text-gray-400">
                                    in {source.chatTitle}
                                </span>
                            )}
                            {source.timestamp && (
                                <span className="text-gray-400 ml-auto text-[10px]">
                                    {formatDate(source.timestamp)}
                                </span>
                            )}
                        </div>
                        <p className="text-gray-600 line-clamp-2">{source.text}</p>
                    </div>
                ))}
            </div>
            {sources.length > 3 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-1.5 text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
                >
                    {expanded ? (
                        <>Show less <ChevronUp className="w-3 h-3" /></>
                    ) : (
                        <>Show {sources.length - 3} more <ChevronDown className="w-3 h-3" /></>
                    )}
                </button>
            )}
        </div>
    );
}

// --- Commitments Card ---

export function CommitmentsCard({ commitments }: { commitments: Commitment[] }) {
    if (commitments.length === 0) return null;

    const overdue = commitments.filter(c => c.due_date && new Date(c.due_date) < new Date() && c.status === 'pending');
    const pending = commitments.filter(c => !overdue.includes(c) && c.status === 'pending');

    return (
        <div className="mt-2">
            <div className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                <CheckSquare className="w-3 h-3" />
                Commitments ({commitments.length})
            </div>
            <div className="space-y-1.5">
                {overdue.length > 0 && (
                    <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                        <div className="text-[10px] font-medium text-red-600 mb-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Overdue
                        </div>
                        {overdue.map((c) => (
                            <CommitmentItem key={c.id} commitment={c} isOverdue />
                        ))}
                    </div>
                )}
                {pending.map((c) => (
                    <CommitmentItem key={c.id} commitment={c} />
                ))}
            </div>
        </div>
    );
}

function CommitmentItem({ commitment, isOverdue }: { commitment: Commitment; isOverdue?: boolean }) {
    const priorityColors: Record<string, string> = {
        high: 'bg-red-100 text-red-700',
        medium: 'bg-yellow-100 text-yellow-700',
        low: 'bg-blue-100 text-blue-700',
    };
    const priorityClass = priorityColors[commitment.priority || 'medium'] || priorityColors.medium;

    return (
        <div className={`flex items-start gap-2 py-1 text-xs ${isOverdue ? 'text-red-700' : 'text-gray-700'}`}>
            <div className="flex-1 min-w-0">
                <span className="font-medium">{commitment.title}</span>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${priorityClass}`}>
                        {commitment.priority || 'medium'}
                    </span>
                    <span className="text-gray-400 text-[10px]">
                        {commitment.committed_by === 'me' ? 'By you' : commitment.committed_by === 'them' ? 'By them' : 'Mutual'}
                    </span>
                    {commitment.due_date && (
                        <span className="text-gray-400 text-[10px] flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDate(commitment.due_date)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Summary Card ---

export function SummaryCard({ summary }: { summary: SummaryData }) {
    return (
        <div className="mt-2">
            <div className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                Conversation Summary
            </div>

            {summary.keyTopics.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {summary.keyTopics.map((topic, i) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded-full">
                            {topic}
                        </span>
                    ))}
                </div>
            )}

            {summary.actionItems.length > 0 && (
                <div className="mt-2 px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
                    <div className="text-[10px] font-medium text-green-700 mb-1">Action Items</div>
                    {summary.actionItems.map((item, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-green-800 py-0.5">
                            <span className="text-green-500 mt-0.5">•</span>
                            <span>{item}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// --- Intent Badge ---

export function IntentBadge({ intent }: { intent: string }) {
    const intentConfig: Record<string, { icon: string; label: string; color: string }> = {
        retrieval: { icon: '🔍', label: 'Search', color: 'bg-blue-50 text-blue-700' },
        question: { icon: '🔍', label: 'Search', color: 'bg-blue-50 text-blue-700' },
        commitment: { icon: '✅', label: 'Commitments', color: 'bg-green-50 text-green-700' },
        casual: { icon: '💬', label: 'Chat', color: 'bg-gray-100 text-gray-600' },
        command: { icon: '⚡', label: 'Command', color: 'bg-purple-50 text-purple-700' },
        summary: { icon: '📝', label: 'Summary', color: 'bg-yellow-50 text-yellow-700' },
    };

    const config = intentConfig[intent] || intentConfig.casual;

    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color}`}>
            {config.icon} {config.label}
        </span>
    );
}

// --- Helper ---

function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}
