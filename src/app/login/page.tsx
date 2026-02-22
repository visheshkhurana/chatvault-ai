'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageSquare, Mail, Lock, Loader2 } from 'lucide-react';

export default function LoginPage() {
        const [email, setEmail] = useState('');
        const [password, setPassword] = useState('');
        const [isSignUp, setIsSignUp] = useState(false);
        const [isForgotPassword, setIsForgotPassword] = useState(false);
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState('');
        const [message, setMessage] = useState('');

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
                                                const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
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
                <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center px-4">
                            <div className="w-full max-w-md">
                                            <div className="text-center mb-8">
                                                                <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                                                                        <MessageSquare className="w-9 h-9 text-white" />
                                                                </div>
                                                                <h1 className="text-3xl font-bold text-gray-900">ChatVault AI</h1>
                                                                <p className="text-gray-500 mt-2">Your WhatsApp memory, searchable</p>
                                            </div>
                            
                                            <div className="bg-white rounded-2xl shadow-xl p-8">
                                                                <h2 className="text-xl font-semibold text-gray-900 mb-6">
                                                                    {isForgotPassword ? 'Reset Password' : isSignUp ? 'Create Account' : 'Welcome Back'}
                                                                </h2>
                                            
                                                                <form onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit} className="space-y-4">
                                                                                        <div>
                                                                                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                                                                                                    <div className="relative">
                                                                                                                                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                                                                                                                                    <input
                                                                                                                                                                                            type="email"
                                                                                                                                                                                            value={email}
                                                                                                                                                                                            onChange={(e: any) => setEmail(e.target.value)}
                                                                                                                                                                                            required
                                                                                                                                                                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
                                                                                                                                                                                            placeholder="you@example.com"
                                                                                                                                                                                        />
                                                                                                                        </div>
                                                                                            </div>
                                                                
                                                                                        {!isForgotPassword && (
                                                                                        <div>
                                                                                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                                                                                                    <div className="relative">
                                                                                                                                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                                                                                                                                    <input
                                                                                                                                                                                            type="password"
                                                                                                                                                                                            value={password}
                                                                                                                                                                                            onChange={(e: any) => setPassword(e.target.value)}
                                                                                                                                                                                            required
                                                                                                                                                                                            minLength={6}
                                                                                                                                                                                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900"
                                                                                                                                                                                            placeholder="••••••••"
                                                                                                                                                                                        />
                                                                                                                        </div>
                                                                                            </div>
                                                                                        )}
                                                                
                                                                    {error && (
                                                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
                                                                                        )}
                                                                    {message && (
                                                <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{message}</div>
                                                                                        )}
                                                                
                                                                                        <button
                                                                                                                        type="submit"
                                                                                                                        disabled={loading}
                                                                                                                        className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                                                                                                    >
                                                                                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                                                                            {isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Sign Up' : 'Sign In'}
                                                                                            </button>
                                                                </form>

                                                                <div className="mt-6 text-center space-y-2">
                                                                                        {!isForgotPassword && !isSignUp && (
                                                                                            <button
                                                                                                onClick={() => { setIsForgotPassword(true); setError(''); setMessage(''); }}
                                                                                                className="text-sm text-gray-500 hover:text-gray-700 block w-full"
                                                                                            >
                                                                                                Forgot your password?
                                                                                            </button>
                                                                                        )}
                                                                                        <button
                                                                                                                        onClick={() => { setIsSignUp(!isSignUp); setIsForgotPassword(false); setError(''); setMessage(''); }}
                                                                                                                        className="text-sm text-green-600 hover:text-green-700"
                                                                                                                    >
                                                                                            {isForgotPassword ? 'Back to Sign In' : isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                                                                                            </button>
                                                                </div>
                                            </div>
                            
                                            <p className="text-center text-xs text-gray-400 mt-8">
                                                                By signing in, you agree to our Terms of Service and Privacy Policy.
                                                                Your WhatsApp messages will be stored securely and encrypted at rest.
                                            </p>
                            </div>
                </div>
            );
}
