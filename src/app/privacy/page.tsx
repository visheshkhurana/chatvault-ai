import Link from 'next/link';
import { MessageSquare, ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy Policy',
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-surface-50">
            {/* Nav */}
            <nav className="bg-white border-b border-surface-100">
                <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
                            <MessageSquare className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-bold text-surface-900">Rememora</span>
                    </Link>
                    <Link href="/" className="text-sm text-surface-500 hover:text-surface-700 flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" /> Back
                    </Link>
                </div>
            </nav>

            <div className="max-w-4xl mx-auto px-6 py-16">
                <h1 className="text-3xl font-bold text-surface-900 mb-2">Privacy Policy</h1>
                <p className="text-sm text-surface-400 mb-10">Last updated: February 27, 2026</p>

                <div className="prose prose-surface max-w-none space-y-8 text-surface-600 leading-relaxed">
                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">1. Overview</h2>
                        <p>
                            At Rememora, your privacy is fundamental to our product. This policy explains what data we collect,
                            how we use it, and the controls you have. We are committed to transparency and minimal data collection.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">2. Data We Collect</h2>
                        <p><strong className="text-surface-800">Account data:</strong> Email address and hashed password for authentication.</p>
                        <p className="mt-2"><strong className="text-surface-800">WhatsApp data:</strong> When you connect WhatsApp, we index your messages,
                            media metadata, and attachments to enable search and AI features. Message content is encrypted at rest using AES-256.</p>
                        <p className="mt-2"><strong className="text-surface-800">Usage data:</strong> Basic analytics like feature usage counts and session
                            duration to improve the product. We do not track individual message content for analytics.</p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">3. How We Use Your Data</h2>
                        <ul className="list-disc ml-6 space-y-1">
                            <li>To provide semantic search across your conversations</li>
                            <li>To generate AI summaries and extract commitments</li>
                            <li>To process attachments (OCR, document parsing)</li>
                            <li>To send you reminders for tracked commitments</li>
                            <li>To improve service reliability and performance</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">4. What We Never Do</h2>
                        <ul className="list-disc ml-6 space-y-1">
                            <li><strong className="text-surface-800">Never sell your data</strong> to third parties</li>
                            <li><strong className="text-surface-800">Never train AI models</strong> on your conversations</li>
                            <li><strong className="text-surface-800">Never share message content</strong> with advertisers</li>
                            <li><strong className="text-surface-800">Never access your data</strong> without your explicit action</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">5. Data Security</h2>
                        <p>We employ multiple layers of security:</p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li>AES-256 encryption for data at rest</li>
                            <li>TLS 1.3 for data in transit</li>
                            <li>Row-level security (RLS) in our database — your data is isolated from other users</li>
                            <li>Regular security audits and dependency updates</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">6. Third-Party Services</h2>
                        <p>We use the following services to operate Rememora:</p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li><strong className="text-surface-800">Supabase:</strong> Database and authentication (hosted in the US)</li>
                            <li><strong className="text-surface-800">Vercel:</strong> Application hosting</li>
                            <li><strong className="text-surface-800">OpenRouter:</strong> AI inference for search and summaries (message content is sent for processing but not stored)</li>
                            <li><strong className="text-surface-800">Backblaze B2:</strong> Encrypted attachment storage</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">7. Data Retention &amp; Deletion</h2>
                        <p>
                            Your data is retained as long as your account is active. You can delete individual chats or your
                            entire account at any time. Upon account deletion, all data is permanently purged within 30 days.
                            Backups are rotated on a 90-day cycle.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">8. Your Rights</h2>
                        <p>You have the right to:</p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li>Access all data we hold about you</li>
                            <li>Export your data in standard formats</li>
                            <li>Request deletion of your account and all associated data</li>
                            <li>Disconnect WhatsApp at any time, stopping all data sync</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">9. Contact</h2>
                        <p>
                            For privacy-related questions, contact us at{' '}
                            <a href="mailto:privacy@rememora.app" className="text-brand-600 hover:underline">privacy@rememora.app</a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}

