'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageSquare, Mail, Lock, Loader2, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [emailTouched, setEmailTouched] = useState(false);
    const [passwordTouched, setPasswordTouched] = useState(false);

    const emailError = emailTouched && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) ? 'Please enter a valid email address' : '';
    const passwordError = passwordTouched && !isForgotPassword && password.length > 0 && password.length < 6 ? 'Password must be at least 6 characters' : '';

    async function handleForgotPassword(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
            });
            if (error) throw error;
            setMessage('Password reset link sent! Check your email.');
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
                });
                if (error) throw error;
                setMessage('Check your email for a confirmation link.');
            } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                window.location.href = '/dashboard';
            }
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    }

    return (
        <div className="min-h-screen flex">
            {/* Left panel - Branding */}
            <div className="hidden lg:flex lg:w-1/2 bg-surface-900 relative overflow-hidden items-center justify-center p-12">
                {/* Decorative elements */}
                <div className="absolute inset-0">
                    <div className="absolute top-20 left-20 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl" />
                    <div className="absolute bottom-20 right-20 w-80 h-80 bg-brand-400/10 rounded-full blur-3xl" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl" />
                </div>

                <div className="relative z-10 max-w-md">
                    <div className="w-14 h-14 bg-gradient-to-br from-brand-400 to-brand-600 rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-brand-500/30">
                        <MessageSquare className="w-7 h-7 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-white leading-tight mb-4">
                        Rememora
                    </h1>
                    <p className="text-surface-400 text-lg leading-relaxed mb-8">
                        Your AI-powered WhatsApp memory. Search conversations, track commitments, and never lose an important message again.
                    </p>

                    {/* Feature bullets */}
                    <div className="space-y-4">
                        {[
                            'AI-powered semantic search',
                            'Automatic chat summaries',
                            'Commitment & deadline tracking',
                        ].map((feature) => (
                            <div key={feature} className="flex items-center gap-3 text-surface-300">
                                <div className="w-6 h-6 bg-brand-500/20 border border-brand-500/30 rounded-md flex items-center justify-center flex-shrink-0">
                                    <Sparkles className="w-3 h-3 text-brand-400" />
                                </div>
                                <span className="text-sm">{feature}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right panel - Auth form */}
            <div className="flex-1 flex items-center justify-center p-6 bg-surface-50">
                <div className="w-full max-w-md">
                    {/* Mobile logo */}
                    <div className="lg:hidden flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20">
                            <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold text-surface-900 tracking-tight">
                            Rememora
                        </span>
                    </div>

                    {/* Back to home */}
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-surface-700 transition-colors mb-8"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to home
                    </Link>

                    {/* Form card */}
                    <div className="bg-white rounded-2xl shadow-xl shadow-surface-900/5 border border-surface-100 p-8">
                        <h2 className="text-2xl font-bold text-surface-900 mb-1">
                            {isForgotPassword ? 'Reset password' : isSignUp ? 'Create your account' : 'Welcome back'}
                        </h2>
                        <p className="text-surface-500 text-sm mb-8">
                            {isForgotPassword
                                ? 'Enter your email and we\'ll send you a reset link.'
                                : isSignUp
                                ? 'Create your Rememora account to get started.'
                                : 'Sign in to your Rememora account.'}
                        </p>

                        <form onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit} className="space-y-5">
                            {/* Email field */}
                            <div>
                                <label className="block text-sm font-medium text-surface-700 mb-1.5">Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e: any) => setEmail(e.target.value)}
                                        onBlur={() => setEmailTouched(true)}
                                        required
                                        className={`input-modern pl-10 ${emailError ? 'border-red-300 focus:ring-red-500' : ''}`}
                                        placeholder="you@example.com"
                                    />
                                </div>
                                {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
                            </div>

                            {/* Password field */}
                            {!isForgotPassword && (
                                <div>
                                    <label className="block text-sm font-medium text-surface-700 mb-1.5">Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e: any) => setPassword(e.target.value)}
                                            onBlur={() => setPasswordTouched(true)}
                                            required
                                            minLength={6}
                                            className={`input-modern pl-10 ${passwordError ? 'border-red-300 focus:ring-red-500' : ''}`}
                                            placeholder="Min. 6 characters"
                                        />
                                    </div>
                                    {passwordError && <p className="text-xs text-red-500 mt-1">{passwordError}</p>}
                                </div>
                            )}

                            {/* Error / Success messages */}
                            {error && (
                                <div className="p-3.5 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
                                    {error}
                                </div>
                            )}
                            {message && (
                                <div className="p-3.5 bg-brand-50 border border-brand-100 text-brand-700 rounded-xl text-sm">
                                    {message}
                                </div>
                            )}

                            {/* Submit button */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary w-full flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        {isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Create Account' : 'Sign In'}
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Secondary actions */}
                        <div className="mt-6 pt-6 border-t border-surface-100 text-center space-y-3">
                            {!isForgotPassword && !isSignUp && (
                                <button
                                    onClick={() => { setIsForgotPassword(true); setError(''); setMessage(''); }}
                                    className="text-sm text-surface-500 hover:text-surface-700 transition-colors block w-full"
                                >
                                    Forgot your password?
                                </button>
                            )}
                            <button
                                onClick={() => { setIsSignUp(!isSignUp); setIsForgotPassword(false); setError(''); setMessage(''); }}
                                className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
                            >
                                {isForgotPassword
                                    ? 'Back to Sign In'
                                    : isSignUp
                                    ? 'Already have an account? Sign in'
                                    : "Don't have an account? Sign up"}
                            </button>
                        </div>
                    </div>

                    <p className="text-center text-xs text-surface-400 mt-6 leading-relaxed">
                        By continuing, you agree to our Terms of Service and Privacy Policy.
                    </p>
                </div>
            </div>
        </div>
    );
}
