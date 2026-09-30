import React, { useState } from 'react';
import { Download, Sparkles, X, Smartphone, CheckCircle } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-amber-950 shadow-md transition-all shrink-0 animate-pulse border border-yellow-300/60"
        title="Install Bappa Locator for instant offline access"
      >
        <Download className="w-3.5 h-3.5 stroke-[2.5]" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-900/90 text-yellow-300 hover:bg-amber-800 border border-yellow-500/40 shadow-sm transition-all shrink-0"
          title="Install on iPhone / iPad"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-amber-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2 text-amber-800 font-bold">
                  <Sparkles className="w-5 h-5 text-yellow-500" />
                  <h3>Install Bappa Locator</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                Use Bappa Locator 100% offline even without internet connectivity or when your phone is in airplane mode:
              </p>
              <div className="bg-amber-50 rounded-xl p-3.5 text-xs text-gray-700 space-y-2 border border-amber-200/70 mb-4">
                <div className="flex items-start gap-2">
                  <span className="bg-amber-800 text-yellow-200 font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shrink-0">1</span>
                  <span>Tap the <strong>Share</strong> button (box with upward arrow) in Safari toolbar.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-amber-800 text-yellow-200 font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shrink-0">2</span>
                  <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="bg-amber-800 text-yellow-200 font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shrink-0">3</span>
                  <span>Tap <strong>Add</strong> in top right.</span>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-yellow-300 font-bold text-xs transition-colors"
              >
                Got it!
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
