'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Zap, CheckCircle, XCircle, Clock, Play, AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';

interface AgenticTask {
    id: string;
    type: string;
    description: string;
    parameters?: Record<string, any>;
    triggered_by?: string;
    status: 'pending_approval' | 'running' | 'completed' | 'failed';
    result?: string;
    error?: string;
    created_at: string;
}

export default function AgenticTasksSection() {
    const [tasks, setTasks] = useState<AgenticTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formData, setFormData] = useState({
        type: 'send_message',
        description: '',
    });

    useEffect(() => {
        loadTasks();
    }, []);

    async function loadTasks() {
        setLoading(true);
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/agentic-tasks', {
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setTasks(data.tasks || []);
        } catch (err) {
            console.error('Failed to load tasks:', err);
        }
        setLoading(false);
    }

    async function approveTask(taskId: string) {
        try {
            const session = await supabase.auth.getSession();
            const response = await fetch(`/api/agentic-tasks/${taskId}/approve`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            const data = await response.json();
            setTasks(tasks.map(t =>
                t.id === taskId ? { ...t, status: 'running' } : t
            ));
        } catch (err) {
            console.error('Failed to approve task:', err);
        }
    }

    async function cancelTask(taskId: string) {
        try {
            const session = await supabase.auth.getSession();
            await fetch(`/api/agentic-tasks/${taskId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
            });
            setTasks(tasks.filter(t => t.id !== taskId));
        } catch (err) {
            console.error('Failed to cancel task:', err);
        }
    }

    async function createTask() {
        if (!formData.description.trim()) return;

        try {
            const session = await supabase.auth.getSession();
            const response = await fetch('/api/agentic-tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.data.session?.access_token}`,
                },
                body: JSON.stringify(formData),
            });
            const data = await response.json();
            setTasks([...tasks, data.task]);
            setFormData({ type: 'send_message', description: '' });
            setShowCreateForm(false);
        } catch (err) {
            console.error('Failed to create task:', err);
        }
    }

    const filteredTasks = tasks.filter(t => t.status.split('_')[0] === activeTab ||
        (activeTab === 'pending' && t.status === 'pending_approval'));

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending_approval': return <Clock className="w-5 h-5 text-amber-600" />;
            case 'running': return <Play className="w-5 h-5 text-blue-600" />;
            case 'completed': return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'failed': return <XCircle className="w-5 h-5 text-red-600" />;
            default: return <AlertTriangle className="w-5 h-5 text-surface-600" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending_approval': return 'bg-amber-50 border-amber-200';
            case 'running': return 'bg-blue-50 border-blue-200';
            case 'completed': return 'bg-green-50 border-green-200';
            case 'failed': return 'bg-red-50 border-red-200';
            default: return 'bg-surface-50 border-surface-200';
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-brand-600" />
                    Task Execution
                </h2>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Create Task
                </button>
            </div>

            {/* Create Form */}
            {showCreateForm && (
                <div className="bg-white rounded-xl border border-surface-200 p-4 space-y-3">
                    <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white"
                    >
                        <option value="send_message">Send Message</option>
                        <option value="create_reminder">Create Reminder</option>
                        <option value="log_commitment">Log Commitment</option>
                        <option value="archive_chat">Archive Chat</option>
                    </select>
                    <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Task description..."
                        className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm bg-white h-20 resize-none"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={createTask}
                            className="flex-1 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
                        >
                            Create
                        </button>
                        <button
                            onClick={() => setShowCreateForm(false)}
                            className="flex-1 px-3 py-2 bg-surface-100 text-surface-700 rounded-lg text-sm font-medium hover:bg-surface-200"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto">
                {(['pending', 'running', 'completed', 'failed'] as const).map((tab) => {
                    const count = tasks.filter(t =>
                        tab === 'pending' ? t.status === 'pending_approval' : t.status.startsWith(tab)
                    ).length;
                    return (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
                                activeTab === tab
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
                            }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Tasks List */}
            {filteredTasks.length === 0 ? (
                <div className="bg-white rounded-xl border border-surface-200 p-12 text-center">
                    <Zap className="w-8 h-8 text-surface-300 mx-auto mb-3" />
                    <p className="text-surface-600 font-medium">No {activeTab} tasks</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredTasks.map((task) => (
                        <div key={task.id} className={`bg-white rounded-xl border border-surface-200 p-4 ${getStatusColor(task.status)}`}>
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-start gap-3 flex-1">
                                    <div className="mt-1">
                                        {getStatusIcon(task.status)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs bg-white border border-surface-200 px-2 py-0.5 rounded capitalize">
                                                {task.type.replace('_', ' ')}
                                            </span>
                                            {task.triggered_by && (
                                                <span className="text-xs text-surface-500">by {task.triggered_by}</span>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-surface-900">{task.description}</p>
                                        <p className="text-xs text-surface-500 mt-1">
                                            {new Date(task.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                {task.status === 'pending_approval' && (
                                    <button
                                        onClick={() => cancelTask(task.id)}
                                        className="flex-shrink-0 p-1 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4 text-red-600" />
                                    </button>
                                )}
                            </div>

                            {/* Actions for Pending */}
                            {task.status === 'pending_approval' && (
                                <div className="flex gap-2 mt-3">
                                    <button
                                        onClick={() => approveTask(task.id)}
                                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => cancelTask(task.id)}
                                        className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                            {/* Result Display */}
                            {task.result && (
                                <div className="mt-3 p-3 bg-white rounded-lg border border-surface-200">
                                    <p className="text-xs font-semibold text-surface-900 mb-1">Result</p>
                                    <p className="text-sm text-surface-700">{task.result}</p>
                                </div>
                            )}

                            {/* Error Display */}
                            {task.error && (
                                <div className="mt-3 p-3 bg-white rounded-lg border border-red-200">
                                    <p className="text-xs font-semibold text-red-900 mb-1">Error</p>
                                    <p className="text-sm text-red-700">{task.error}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
