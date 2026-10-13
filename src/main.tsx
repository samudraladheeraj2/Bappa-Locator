import { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';

// Only register Service Worker for PWA web browsers in production.
// Strictly skip on native Capacitor Android/iOS and localhost to prevent native WebView blanking or cache conflicts.
const isNative = Capacitor.isNativePlatform() || window.location.hostname === 'localhost';
if (import.meta.env.PROD && !isNative) {
  try {
    registerSW({ immediate: true });
  } catch (err) {
    console.warn('Service worker registration skipped:', err);
  }
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught application error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-16 h-16 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center text-3xl font-bold mb-4 shadow-sm border border-amber-200">
            🚩
          </div>
          <h1 className="text-xl font-bold text-amber-950 mb-2">Pandal Hopper</h1>
          <p className="text-sm text-gray-600 max-w-sm mb-6 leading-relaxed">
            Something unexpected occurred while loading the app. Please tap below to refresh.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-gradient-to-r from-amber-700 to-yellow-600 text-white text-xs font-extrabold rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
