'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Wifi, Search, CheckCircle2, MessageSquare, ArrowRight,
  Sparkles, X, ChevronRight,
} from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  action?: () => void;
  completed?: boolean;
}

interface OnboardingFlowProps {
  onComplete: () => void;
  onSkip: () => void;
  bridgeConnected: boolean;
  onNavigate: (tab: string) => void;
}

export default function OnboardingFlow({
  onComplete,
  onSkip,
  bridgeConnected,
  onNavigate,
}: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [animating, setAnimating] = useState(false);

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to Rememora',
      description: 'Your AI-powered WhatsApp memory. Let\'s get you set up in 60 seconds.',
      icon: Sparkles,
      color: 'from-brand-400 to-brand-600',
    },
    {
      id: 'connect',
      title: 'Connect WhatsApp',
      description: bridgeConnected
        ? 'WhatsApp is connected! Your messages are syncing.'
        : 'Go to Settings to scan the QR code and connect your WhatsApp.',
      icon: Wifi,
      color: bridgeConnected ? 'from-emerald-400 to-emerald-600' : 'from-amber-400 to-amber-600',
      completed: bridgeConnected,
      action: () => {
        if (!bridgeConnected) onNavigate('settings');
      },
    },
    {
      id: 'search',
      title: 'Try your first search',
      description: 'Ask Rememora anything about your conversations. Try: "What did I discuss recently?"',
      icon: Search,
      color: 'from-blue-400 to-blue-600',
      action: () => onNavigate('home'),
    },
    {
      id: 'commitments',
      title: 'Track commitments',
      description: 'Rememora automatically detects promises and commitments from your chats.',
      icon: CheckCircle2,
      color: 'from-violet-400 to-violet-600',
      action: () => onNavigate('actions'),
    },
    {
      id: 'done',
      title: 'You\'re all set!',
      description: 'Rememora is ready. Chat with the AI assistant anytime to search, summarize, or track your conversations.',
      icon: MessageSquare,
      color: 'from-brand-400 to-brand-600',
    },
  ];

  // Auto-advance when bridge connects while on connect step
  useEffect(() => {
    if (bridgeConnected && currentStep === 1 && !completedSteps.has('connect')) {
      markComplete('connect');
    }
  }, [bridgeConnected, currentStep]);

  function markComplete(stepId: string) {
    setCompletedSteps((prev) => new Set([...prev, stepId]));
  }

  async function handleNext() {
    setAnimating(true);
    markComplete(steps[currentStep].id);

    if (currentStep === steps.length - 1) {
      // Final step — complete onboarding
      await saveOnboardingProgress(true);
      onComplete();
      return;
    }

    setTimeout(() => {
      setCurrentStep((prev) => prev + 1);
      setAnimating(false);
    }, 200);
  }

  async function handleSkip() {
    await saveOnboardingProgress(false);
    onSkip();
  }

  async function saveOnboardingProgress(completed: boolean) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          completed,
          current_step: currentStep,
          steps_completed: Array.from(completedSteps),
          skipped: !completed,
        }),
      });
    } catch {
      // Non-critical — proceed anyway
    }
  }

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-surface-100">
          <div
            className="h-full bg-brand-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-6">
          {/* Skip button */}
          {!isLast && (
            <div className="flex justify-end mb-2">
              <button
                onClick={handleSkip}
                className="text-xs text-surface-400 hover:text-surface-600 transition-colors flex items-center gap-1"
              >
                Skip setup <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Step content */}
          <div className={`text-center transition-opacity duration-200 ${animating ? 'opacity-0' : 'opacity-100'}`}>
            {/* Icon */}
            <div className="inline-flex mb-5">
              <div className={`w-16 h-16 bg-gradient-to-br ${step.color} rounded-2xl flex items-center justify-center shadow-lg`}>
                <step.icon className="w-8 h-8 text-white" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-surface-900 mb-2">{step.title}</h2>
            <p className="text-sm text-surface-500 leading-relaxed max-w-xs mx-auto">
              {step.description}
            </p>

            {/* Step-specific content */}
            {step.id === 'connect' && step.completed && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full text-xs text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Connected
              </div>
            )}

            {step.id === 'search' && (
              <div className="mt-4 mx-auto max-w-xs">
                <div className="flex gap-2 flex-wrap justify-center">
                  {['What did I discuss recently?', 'Show my commitments', 'Summarize a chat'].map((q) => (
                    <span key={q} className="px-2.5 py-1 bg-surface-50 border border-surface-200 rounded-full text-xs text-surface-600">
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step indicators */}
          <div className="flex justify-center gap-1.5 mt-6 mb-5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-brand-500'
                    : i < currentStep
                    ? 'w-1.5 bg-brand-300'
                    : 'w-1.5 bg-surface-200'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {step.action && !step.completed && (
              <button
                onClick={step.action}
                className="flex-1 px-4 py-3 bg-surface-50 border border-surface-200 text-sm font-medium text-surface-700 rounded-xl hover:bg-surface-100 transition-colors flex items-center justify-center gap-2"
              >
                {step.id === 'connect' ? 'Go to Settings' : 'Try it'}
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex-1 px-4 py-3 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {isLast ? 'Get Started' : 'Next'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
