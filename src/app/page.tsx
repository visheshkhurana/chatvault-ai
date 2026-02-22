import Link from 'next/link';
import { MessageSquare, Search, Brain, Shield, Zap, FileText } from 'lucide-react';

export default function Home() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
            {/* Hero Section */}
            <div className="max-w-6xl mx-auto px-4 pt-16 pb-24">
                <nav className="flex items-center justify-between mb-20">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
                            <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold text-gray-900">ChatVault AI</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link
                            href="/login"
                            className="px-5 py-2 text-green-700 font-medium hover:text-green-800 transition-colors"
                        >
                            Sign In
                        </Link>
                        <Link
                            href="/login"
                            className="px-5 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
                        >
                            Get Started
                        </Link>
                    </div>
                </nav>

                <div className="text-center max-w-3xl mx-auto">
                    <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight mb-6">
                        Your WhatsApp messages,{' '}
                        <span className="text-green-600">searchable with AI</span>
                    </h1>
                    <p className="text-xl text-gray-600 mb-10 leading-relaxed">
                        ChatVault AI is your personal memory layer for WhatsApp. Search across
                        conversations, find shared documents, and get AI-powered summaries of
                        your chats — all securely stored and private.
                    </p>
                    <div className="flex items-center justify-center gap-4">
                        <Link
                            href="/login"
                            className="px-8 py-4 bg-green-600 text-white rounded-xl font-semibold text-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-200"
                        >
                            Start Free
                        </Link>
                    </div>
                </div>
            </div>

            {/* Features Grid */}
            <div className="max-w-6xl mx-auto px-4 pb-24">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                        {
                            icon: Search,
                            title: 'Semantic Search',
                            description:
                                'Search your messages by meaning, not just keywords. Find "that restaurant recommendation" even if you forgot the name.',
                        },
                        {
                            icon: Brain,
                            title: 'AI Summaries',
                            description:
                                'Get concise summaries of long group chats, extract action items, and surface key decisions automatically.',
                        },
                        {
                            icon: FileText,
                            title: 'Document Search',
                            description:
                                'Automatically extracts and indexes text from PDFs, images (OCR), and voice notes shared in your chats.',
                        },
                        {
                            icon: Shield,
                            title: 'Privacy First',
                            description:
                                'Your data is encrypted at rest and in transit. Only you can access your messages. No data is shared with third parties.',
                        },
                        {
                            icon: Zap,
                            title: 'Real-time Sync',
                            description:
                                'Messages sync automatically as they arrive. Your searchable archive grows in the background.',
                        },
                        {
                            icon: MessageSquare,
                            title: 'Chat Commands',
                            description:
                                'Search your history directly from WhatsApp with bot commands like /search, /summary, and /remind.',
                        },
                    ].map((feature) => (
                        <div
                            key={feature.title}
                            className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                        >
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-5">
                                <feature.icon className="w-6 h-6 text-green-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-3">{feature.title}</h3>
                            <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <footer className="border-t border-green-200 py-8">
                <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
                    <p>ChatVault AI — Your WhatsApp memory, always searchable.</p>
                </div>
            </footer>
        </div>
    );
}
