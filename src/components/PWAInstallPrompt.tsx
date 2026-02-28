'use client';

import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { usePWA } from '@/hooks/usePWA';

/**
 * PWA Install Banner — shows when the app is installable but not yet installed.
 * Dismissible, remembers dismissal for 7 days via localStorage.
 */
export default function PWAInstallPrompt() {
  const { isInstallable, isInstalled, installApp } = usePWA();
  const [dismissed, setDismissed] = useState(true); // default hidden

  useEffect(() => {
    // Check if user previously dismissed
    const dismissedAt = localStorage.getItem('pwa-install-dismissed');
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (elapsed < sevenDays) return; // Still within dismissal window
    }
    setDismissed(false);
  }, []);

  if (!isInstallable || isInstalled || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  const handleInstall = async () => {
    const success = await installApp();
    if (!success) {
      // User declined — treat same as dismiss
      handleDismiss();
    }
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white border border-surface-200 rounded-2xl shadow-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-surface-900">
              Install Rememora
            </h3>
            <p className="text-xs text-surface-500 mt-0.5">
              Add to your home screen for quick access and offline support.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs text-surface-500 hover:text-surface-700 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-surface-300 hover:text-surface-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
