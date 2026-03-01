'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

type FeedbackStep = 'sean-ellis' | 'nps' | 'open-ended' | 'done';

interface FeedbackPromptProps {
    userId: string;
    daysActive?: number;
    onDismiss?: () => void;
}

export default function FeedbackPrompt({ userId, daysActive = 0, onDismiss }: FeedbackPromptProps) {
    const [step, setStep] = useState<FeedbackStep>('sean-ellis');
    const [visible, setVisible] = useState(false);
    const [seanEllis, setSeanEllis] = useState('');
    const [npsScore, setNpsScore] = useState<number | null>(null);
    const [openText, setOpenText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const supabase = createClientComponentClient();

  useEffect(() => {
        if (daysActive >= 3) {
                checkIfAlreadySubmitted();
        }
  }, [daysActive]);

  async function checkIfAlreadySubmitted() {
        const { data } = await supabase
          .from('user_feedback')
          .select('id')
          .eq('user_id', userId)
          .eq('feedback_type', 'sean_ellis')
          .maybeSingle();
        if (!data) setVisible(true);
  }

  async function submitFeedback(type: string, payload: Record<string, unknown>) {
        setSubmitting(true);
        try {
                await fetch('/api/feedback', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ feedback_type: type, response: payload }),
                });
        } catch (e) {
                console.error('Feedback submit error:', e);
        }
        setSubmitting(false);
  }

  async function handleSeanEllis(answer: string) {
        setSeanEllis(answer);
        await submitFeedback('sean_ellis', { answer });
        setStep('nps');
  }

  async function handleNps(score: number) {
        setNpsScore(score);
        await submitFeedback('nps', { score });
        setStep('open-ended');
  }

  async function handleOpenEnded() {
        if (openText.trim()) {
                await submitFeedback('open_ended', { text: openText });
        }
        setStep('done');
        setTimeout(() => {
                setVisible(false);
                onDismiss?.();
        }, 2000);
  }

  function dismiss() {
        setVisible(false);
        onDismiss?.();
  }

  if (!visible) return null;

  return (
        <div className="fixed bottom-4 right-4 z-50 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-5 animate-in slide-in-from-bottom-4">
              <button onClick={dismiss} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 text-lg">&times;</button>
        
          {step === 'sean-ellis' && (
                  <div>
                            <h3 className="font-semibold text-sm mb-3">Quick question</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                                        How would you feel if you could no longer use Rememora?
                            </p>
                            <div className="space-y-2">
                              {['Very disappointed', 'Somewhat disappointed', 'Not disappointed'].map((opt) => (
                                  <button
                                                    key={opt}
                                                    onClick={() => handleSeanEllis(opt)}
                                                    disabled={submitting}
                                                    className="w-full text-left px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 transition-colors disabled:opacity-50"
                                                  >
                                    {opt}
                                  </button>
                                ))}
                            </div>
                  </div>
              )}
        
          {step === 'nps' && (
                  <div>
                            <h3 className="font-semibold text-sm mb-3">Rate your experience</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                                        How likely are you to recommend Rememora? (0-10)
                            </p>
                            <div className="flex gap-1 flex-wrap">
                              {Array.from({ length: 11 }, (_, i) => (
                                  <button
                                                    key={i}
                                                    onClick={() => handleNps(i)}
                                                    disabled={submitting}
                                                    className={`w-8 h-8 text-xs rounded-md border transition-colors disabled:opacity-50 ${
                                                                        npsScore === i
                                                                          ? 'bg-purple-600 text-white border-purple-600'
                                                                          : 'border-gray-200 dark:border-gray-600 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                                                    }`}
                                                  >
                                    {i}
                                  </button>
                                ))}
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                        <span>Not likely</span>
                                        <span>Very likely</span>
                            </div>
                  </div>
              )}
        
          {step === 'open-ended' && (
                  <div>
                            <h3 className="font-semibold text-sm mb-3">One more thing...</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                                        What would make Rememora better for you?
                            </p>
                            <textarea
                                          value={openText}
                                          onChange={(e) => setOpenText(e.target.value)}
                                          placeholder="Your thoughts..."
                                          className="w-full h-20 text-sm border border-gray-200 dark:border-gray-600 rounded-lg p-2 bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        />
                            <button
                                          onClick={handleOpenEnded}
                                          disabled={submitting}
                                          className="mt-2 w-full py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                                        >
                              {openText.trim() ? 'Submit' : 'Skip'}
                            </button>
                  </div>
              )}
        
          {step === 'done' && (
                  <div className="text-center py-4">
                            <p className="text-2xl mb-2">💜</p>
                            <p className="text-sm font-medium">Thanks for your feedback!</p>
                  </div>
              )}
        </div>
      );
}
