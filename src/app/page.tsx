'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
    MessageSquare, Search, Brain, Shield, Zap, FileText,
    ArrowRight, Sparkles, Lock, BarChart3, CheckCircle2, Globe, Menu, X
} from 'lucide-react';

export default function Home() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    return (
        <div className="min-h-screen bg-surface-50">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-surface-100">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20">
                            <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-lg font-bold text-surface-900 tracking-tight">Rememora</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-surface-500">
                        <a href="#features" className="hover:text-surface-900 transition-colors">Features</a>
                        <a href="#how-it-works" className="hover:text-surface-900 transition-colors">How it Works</a>
                        <a href="#security" className="hover:text-surface-900 transition-colors">Security</a>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/login" className="btn-ghost text-sm">
                            Sign In
                        </Link>
                        <Link href="/login" className="px-5 py-2.5 bg-surface-900 text-white rounded-xl text-sm font-semibold hover:bg-surface-800 transition-colors shadow-sm">
                            Get Started Free
                        </Link>
                        <button
                            className="md:hidden p-2 rounded-lg text-surface-600 hover:text-surface-900 hover:bg-surface-100 transition-colors"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label="Toggle menu"
                        >
                            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
                {/* Mobile menu */}
                {mobileMenuOpen && (
                    <div className="md:hidden border-t border-surface-100 bg-white/95 backdrop-blur-xl">
                        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-4">
                            <a href="#features" className="text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors py-2" onClick={() => setMobileMenuOpen(false)}>Features</a>
                            <a href="#how-it-works" className="text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors py-2" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
                            <a href="#security" className="text-sm font-medium text-surface-600 hover:text-surface-900 transition-colors py-2" onClick={() => setMobileMenuOpen(false)}>Security</a>
                            <div className="flex flex-col gap-2 pt-2 border-t border-surface-100">
                                <Link href="/login" className="btn-ghost text-sm text-center py-2" onClick={() => setMobileMenuOpen(false)}>Sign In</Link>
                                <Link href="/login" className="px-5 py-2.5 bg-surface-900 text-white rounded-xl text-sm font-semibold hover:bg-surface-800 transition-colors shadow-sm text-center" onClick={() => setMobileMenuOpen(false)}>Get Started Free</Link>
                            </div>
                        </div>
                    </div>
                )}
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 overflow-hidden hero-gradient">
                {/* Background decoration */}
                <div className="absolute inset-0 mesh-gradient" />
                <div className="absolute top-20 right-10 w-72 h-72 bg-brand-200/30 rounded-full blur-3xl animate-float" />
                <div className="absolute bottom-10 left-10 w-96 h-96 bg-brand-300/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '3s' }} />

                <div className="relative max-w-7xl mx-auto px-6">
                    <div className="text-center max-w-4xl mx-auto">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 border border-brand-200 rounded-full text-sm font-medium text-brand-700 mb-8 animate-fade-in">
                            <Sparkles className="w-4 h-4" />
                            <span>AI-Powered WhatsApp Memory</span>
                        </div>

                        {/* Headline */}
                        <h1 className="text-5xl md:text-7xl font-bold text-surface-900 leading-[1.1] tracking-tight mb-6 animate-slide-up">
                            Never lose a message{' '}
                            <span className="gradient-text">again</span>
                        </h1>

                        {/* Subheadline */}
                        <p className="text-lg md:text-xl text-surface-500 max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
                            Rememora turns your WhatsApp into a searchable knowledge base.
                            Find any message, document, or conversation with the power of AI — instantly.
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                            <Link href="/login" className="btn-primary text-lg px-8 py-4 flex items-center gap-2">
                                Start Free <ArrowRight className="w-5 h-5" />
                            </Link>
                            <a href="#how-it-works" className="btn-secondary text-lg px-8 py-4">
                                See How It Works
                            </a>
                        </div>

                        {/* Social proof */}
                        <div className="flex items-center justify-center gap-6 mt-12 text-sm text-surface-400 animate-fade-in" style={{ animationDelay: '0.4s' }}>
                            <div className="flex items-center gap-1.5">
                                <Shield className="w-4 h-4 text-brand-500" />
                                <span>Encrypted at rest</span>
                            </div>
                            <div className="w-1 h-1 bg-surface-300 rounded-full" />
                            <div className="flex items-center gap-1.5">
                                <Lock className="w-4 h-4 text-brand-500" />
                                <span>Your data, your control</span>
                            </div>
                            <div className="w-1 h-1 bg-surface-300 rounded-full hidden sm:block" />
                            <div className="hidden sm:flex items-center gap-1.5">
                                <Zap className="w-4 h-4 text-brand-500" />
                                <span>Real-time sync</span>
                            </div>
                        </div>
                    </div>

                    {/* Hero visual - Search demo mockup */}
                    <div className="relative max-w-3xl mx-auto mt-16 animate-slide-up" style={{ animationDelay: '0.3s' }}>
                        <div className="bg-white rounded-2xl shadow-2xl shadow-surface-900/10 border border-surface-200 overflow-hidden">
                            {/* Mock search bar */}
                            <div className="p-6 border-b border-surface-100">
                                <div className="flex items-center gap-3 bg-surface-50 rounded-xl px-4 py-3.5 border border-surface-200">
                                    <Search className="w-5 h-5 text-surface-400" />
                                    <span className="text-surface-400">What was that restaurant Ali recommended last week?</span>
                                </div>
                            </div>
                            {/* Mock result */}
                            <div className="p-6">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                                        <Brain className="w-4 h-4 text-brand-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-surface-900 mb-1">AI Answer</p>
                                        <p className="text-sm text-surface-600 leading-relaxed">
                                            Ali recommended <strong className="text-surface-900">Sakura Sushi Bar</strong> on
                                            Feb 14th in your &quot;Friends Group&quot; chat. He said the omakase was
                                            &quot;absolutely worth it&quot; and suggested booking for Friday evenings.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2 ml-11">
                                    <span className="badge-green">Friends Group</span>
                                    <span className="badge-blue">Feb 14, 2026</span>
                                </div>
                            </div>
                        </div>
                        {/* Glow effect behind card */}
                        <div className="absolute -inset-4 bg-gradient-to-r from-brand-200/40 via-brand-300/30 to-brand-200/40 rounded-3xl blur-2xl -z-10" />
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <p className="text-sm font-semibold text-brand-600 uppercase tracking-wider mb-3">Features</p>
                        <h2 className="text-3xl md:text-4xl font-bold text-surface-900 tracking-tight">
                            Everything you need to remember
                        </h2>
                        <p className="text-lg text-surface-500 mt-4 max-w-2xl mx-auto">
                            Powerful features that make your WhatsApp conversations searchable, organized, and actionable.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            {
                                icon: Search,
                                title: 'Semantic Search',
                                description: 'Search by meaning, not just keywords. Find "that restaurant recommendation" even if you forgot the name.',
                                color: 'bg-brand-50 text-brand-600',
                            },
                            {
                                icon: Brain,
                                title: 'AI Chat Summaries',
                                description: 'Get concise summaries of long group chats. Extract action items and key decisions automatically.',
                                color: 'bg-purple-50 text-purple-600',
                            },
                            {
                                icon: FileText,
                                title: 'Document Search',
                                description: 'Automatically extracts and indexes text from PDFs, images (OCR), and voice notes.',
                                color: 'bg-blue-50 text-blue-600',
                            },
                            {
                                icon: CheckCircle2,
                                title: 'Commitment Tracking',
                                description: 'AI detects promises and deadlines in your chats. Never miss a commitment again.',
                                color: 'bg-amber-50 text-amber-600',
                            },
                            {
                                icon: BarChart3,
                                title: 'Chat Analytics',
                                description: 'Visualize your messaging patterns with hourly heatmaps, volume trends, and contact insights.',
                                color: 'bg-rose-50 text-rose-600',
                            },
                            {
                                icon: Globe,
                                title: 'WhatsApp Bot',
                                description: 'Search your history from WhatsApp itself with commands like /search, /summary, and /remind.',
                                color: 'bg-teal-50 text-teal-600',
                            },
                        ].map((feature) => (
                            <div key={feature.title} className="card-interactive p-8 group">
                                <div className={`w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                                    <feature.icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-lg font-semibold text-surface-900 mb-2">{feature.title}</h3>
                                <p className="text-surface-500 leading-relaxed text-sm">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section id="how-it-works" className="py-24 bg-surface-50">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <p className="text-sm font-semibold text-brand-600 uppercase tracking-wider mb-3">How It Works</p>
                        <h2 className="text-3xl md:text-4xl font-bold text-surface-900 tracking-tight">
                            Three steps to total recall
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
                        {[
                            {
                                step: '01',
                                title: 'Connect WhatsApp',
                                description: 'Scan a QR code to link your WhatsApp. No phone number sharing needed.',
                                icon: MessageSquare,
                            },
                            {
                                step: '02',
                                title: 'Auto-Sync & Index',
                                description: 'Messages sync in real-time. AI indexes everything — text, images, documents, voice notes.',
                                icon: Zap,
                            },
                            {
                                step: '03',
                                title: 'Search & Discover',
                                description: 'Ask questions in natural language. Get instant AI-powered answers with source citations.',
                                icon: Sparkles,
                            },
                        ].map((item, i) => (
                            <div key={item.step} className="relative text-center">
                                <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-600/25">
                                    <item.icon className="w-7 h-7 text-white" />
                                </div>
                                <div className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-2">Step {item.step}</div>
                                <h3 className="text-xl font-semibold text-surface-900 mb-3">{item.title}</h3>
                                <p className="text-surface-500 text-sm leading-relaxed">{item.description}</p>
                                {i < 2 && (
                                    <div className="hidden md:block absolute top-8 -right-4 w-8">
                                        <ArrowRight className="w-5 h-5 text-surface-300" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Security Section */}
            <section id="security" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="bg-surface-900 rounded-3xl p-12 md:p-16 text-center relative overflow-hidden">
                        {/* Background decoration */}
                        <div className="absolute inset-0 opacity-30">
                            <div className="absolute top-10 left-10 w-40 h-40 bg-brand-500/20 rounded-full blur-2xl" />
                            <div className="absolute bottom-10 right-10 w-60 h-60 bg-brand-400/10 rounded-full blur-3xl" />
                        </div>

                        <div className="relative">
                            <div className="w-16 h-16 bg-brand-500/20 border border-brand-500/30 rounded-2xl flex items-center justify-center mx-auto mb-8">
                                <Shield className="w-8 h-8 text-brand-400" />
                            </div>
                            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
                                Your privacy, our priority
                            </h2>
                            <p className="text-surface-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
                                Your messages are encrypted at rest and in transit. Only you can access your data.
                                We never share, sell, or train AI on your conversations.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
                                {[
                                    { icon: Lock, label: 'AES-256 Encryption' },
                                    { icon: Shield, label: 'Row-Level Security' },
                                    { icon: Zap, label: 'Auto Data Expiry' },
                                ].map((item) => (
                                    <div key={item.label} className="flex items-center justify-center gap-3 bg-white/5 border border-white/10 rounded-xl py-4 px-6">
                                        <item.icon className="w-5 h-5 text-brand-400" />
                                        <span className="text-white font-medium text-sm">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 bg-surface-50">
                <div className="max-w-3xl mx-auto px-6 text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-surface-900 tracking-tight mb-4">
                        Ready to unlock your WhatsApp memory?
                    </h2>
                    <p className="text-lg text-surface-500 mb-8">
                        Start searching your conversations in under 2 minutes. Free to get started.
                    </p>
                    <Link href="/login" className="btn-primary text-lg px-10 py-4 inline-flex items-center gap-2">
                        Get Started Free <ArrowRight className="w-5 h-5" />
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-white border-t border-surface-100 py-12">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        {/* Brand */}
                        <div className="md:col-span-2">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
                                    <MessageSquare className="w-4 h-4 text-white" />
                                </div>
                                <span className="font-bold text-surface-900">Rememora</span>
                            </div>
                            <p className="text-sm text-surface-400 leading-relaxed max-w-sm">
                                Your WhatsApp memory, always searchable. Built with privacy first.
                                Find any message, document, or conversation instantly with AI.
                            </p>
                        </div>

                        {/* Product */}
                        <div>
                            <h4 className="text-sm font-semibold text-surface-900 mb-4">Product</h4>
                            <div className="space-y-3">
                                <a href="#features" className="block text-sm text-surface-500 hover:text-surface-700 transition-colors">Features</a>
                                <a href="#how-it-works" className="block text-sm text-surface-500 hover:text-surface-700 transition-colors">How It Works</a>
                                <a href="#security" className="block text-sm text-surface-500 hover:text-surface-700 transition-colors">Security</a>
                            </div>
                        </div>

                        {/* Legal */}
                        <div>
                            <h4 className="text-sm font-semibold text-surface-900 mb-4">Legal</h4>
                            <div className="space-y-3">
                                <Link href="/privacy" className="block text-sm text-surface-500 hover:text-surface-700 transition-colors">Privacy Policy</Link>
                                <Link href="/terms" className="block text-sm text-surface-500 hover:text-surface-700 transition-colors">Terms of Service</Link>
                                <a href="mailto:support@rememora.app" className="block text-sm text-surface-500 hover:text-surface-700 transition-colors">Contact</a>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-surface-100 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <p className="text-xs text-surface-400">© {new Date().getFullYear()} Rememora. All rights reserved.</p>
                        <p className="text-xs text-surface-400">Made with care for your privacy.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
