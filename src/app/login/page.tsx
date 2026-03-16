'use client';

import { useState } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase-browser';
import { MessageSquare, Mail, Lock, Loader2, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
    const supabase = getBrowserSupabaseClient();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [callbackErrorMessage, setCallbackErrorMessage] = useState(() => {
        if (typeof window === 'undefined') return '';
        const urlParams = new URLSearchParams(window.location.search);
        const callbackMessage = urlParams.get('message');
        if (callbackMessage) return callbackMessage;
        const callbackError = urlParams.get('error');
        return callbackError ? `Authentication failed (${callbackError})` : '';
    });
    const [message, setMessage] = useState('');
    const [emailTouched, setEmailTouched] = useState(false);
    const [passwordTouched, setPasswordTouched] = useState(false);

    const [googleLoading, setGoogleLoading] = useState(false);

    const emailError = emailTouched && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) ? 'Please enter a valid email address' : '';
    const passwordError = passwordTouched && !isForgotPassword && password.length > 0 && password.length < 6 ? 'Password must be at least 6 characters' : '';

    async function handleGoogleSignIn() {
        setGoogleLoading(true);
        setError('');
        setCallbackErrorMessage('');
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            });
            if (error) throw error;
        } catch (err: any) {
            setError(err.message);
            setGoogleLoading(false);
        }
    }

    async function handleForgotPassword(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError('');
        setCallbackErrorMessage('');
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
        setCallbackErrorMessage('');
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

                        {/* Google OAuth */}
                        {!isForgotPassword && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleGoogleSignIn}
                                    disabled={googleLoading || loading}
                                    className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm font-medium text-surface-700 hover:bg-surface-50 hover:border-surface-300 transition-all disabled:opacity-50"
                                >
                                    {googleLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                        </svg>
                                    )}
                                    Continue with Google
                                </button>

                                <div className="relative my-6">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-surface-200" />
                                    </div>
                                    <div className="relative flex justify-center text-xs">
                                        <span className="bg-white px-3 text-surface-400">or continue with email</span>
                                    </div>
                                </div>
                            </>
                        )}

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
                            {(error || callbackErrorMessage) && (
                                <div className="p-3.5 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
                                    {error || callbackErrorMessage}
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
                                    onClick={() => { setIsForgotPassword(true); setError(''); setCallbackErrorMessage(''); setMessage(''); }}
                                    className="text-sm text-surface-500 hover:text-surface-700 transition-colors block w-full"
                                >
                                    Forgot your password?
                                </button>
                            )}
                            <button
                                onClick={() => { setIsSignUp(!isSignUp); setIsForgotPassword(false); setError(''); setCallbackErrorMessage(''); setMessage(''); }}
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
                        By continuing, you agree to our{' '}
                        <Link href="/terms" className="text-brand-600 hover:underline">Terms of Service</Link>
                        {' '}and{' '}
                        <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>.
                    </p>
                </div>
            </div>
        </div>
    );
}
