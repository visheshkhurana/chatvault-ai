import Link from 'next/link';
import { MessageSquare, ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Terms of Service',
};

export default function TermsPage() {
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
                <h1 className="text-3xl font-bold text-surface-900 mb-2">Terms of Service</h1>
                <p className="text-sm text-surface-400 mb-10">Last updated: February 27, 2026</p>

                <div className="prose prose-surface max-w-none space-y-8 text-surface-600 leading-relaxed">
                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using Rememora (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
                            If you do not agree, please do not use the Service. We may update these terms from time to time,
                            and continued use constitutes acceptance of changes.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">2. Description of Service</h2>
                        <p>
                            Rememora is an AI-powered tool that connects to your WhatsApp account to index, search, and
                            summarize your conversations. The Service includes semantic search, chat summaries, commitment
                            tracking, and document extraction features.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">3. Account Registration</h2>
                        <p>
                            You must provide accurate information when creating an account. You are responsible for maintaining
                            the security of your account credentials. You must be at least 16 years old to use the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">4. User Data &amp; Privacy</h2>
                        <p>
                            Your WhatsApp messages are encrypted and stored securely. We do not sell, share, or use your
                            conversation data for training AI models. You retain full ownership of your data. See our{' '}
                            <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link> for details.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">5. Acceptable Use</h2>
                        <p>You agree not to:</p>
                        <ul className="list-disc ml-6 mt-2 space-y-1">
                            <li>Use the Service for any unlawful purpose</li>
                            <li>Attempt to reverse-engineer or exploit the Service</li>
                            <li>Use automated means to access the Service beyond its intended use</li>
                            <li>Share your account access with unauthorized users</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">6. Service Availability</h2>
                        <p>
                            We strive to maintain high availability but do not guarantee uninterrupted service. We may
                            perform maintenance or updates that temporarily affect availability. We will make reasonable
                            efforts to notify users of planned downtime.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">7. Limitation of Liability</h2>
                        <p>
                            The Service is provided &quot;as is&quot; without warranties of any kind. Rememora shall not be liable for
                            any indirect, incidental, or consequential damages arising from use of the Service. Our total
                            liability shall not exceed the amount you paid for the Service in the preceding 12 months.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">8. Termination</h2>
                        <p>
                            You may delete your account at any time. Upon deletion, all your indexed data will be permanently
                            removed within 30 days. We reserve the right to suspend or terminate accounts that violate these terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-surface-900 mb-3">9. Contact</h2>
                        <p>
                            If you have questions about these terms, please contact us at{' '}
                            <a href="mailto:support@rememora.app" className="text-brand-600 hover:underline">support@rememora.app</a>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}

