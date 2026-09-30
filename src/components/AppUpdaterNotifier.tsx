import React, { useEffect, useState } from 'react';
import { Sparkles, Download, RefreshCw, X, ArrowUpCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

export const AppUpdaterNotifier: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    // Only run live Capgo updater on native Capacitor runtimes or when Capgo plugin is available
    const checkCapacitorUpdate = async () => {
      try {
        // Notify Capgo runtime that the app loaded successfully
        await CapacitorUpdater.notifyAppReady();

        // Check if latest version is available
        const latest = await CapacitorUpdater.getLatest();
        if (latest && latest.url && latest.version) {
          setUpdateInfo({ version: latest.version, url: latest.url });
          setShowPrompt(true);
        }
      } catch (err) {
        // Silently catch in web/dev preview environment
        console.log('CapacitorUpdater status check:', err);
      }
    };

    checkCapacitorUpdate();
  }, []);

  const handleApplyUpdate = async () => {
    if (!updateInfo || isUpdating) return;

    setIsUpdating(true);
    setUpdateError(null);

    try {
      // 1. Download the new web update package
      const versionData = await CapacitorUpdater.download({
        url: updateInfo.url,
        version: updateInfo.version,
      });

      // 2. Set the newly downloaded bundle
      await CapacitorUpdater.set(versionData);

      // 3. Reload the app to immediately apply the new version
      await CapacitorUpdater.reload();
    } catch (err: any) {
      console.error('Failed to apply Capacitor update:', err);
      setUpdateError(err.message || 'Update failed. Please try again later.');
      setIsUpdating(false);
    }
  };

  if (!showPrompt || !updateInfo) return null;

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border-2 border-amber-400 text-gray-900 space-y-4 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute -top-12 -right-12 w-28 h-28 bg-amber-400/20 rounded-full blur-xl pointer-events-none" />

        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl border border-amber-300">
            <ArrowUpCircle className="w-7 h-7 text-amber-600 animate-bounce" />
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-amber-950 leading-tight">App Update Available</h3>
            <span className="text-[11px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-bold">
              v{updateInfo.version} Ready
            </span>
          </div>
        </div>

        <p className="text-sm text-gray-700 leading-relaxed font-medium">
          A new version of the app is ready. Tap <strong>Update</strong> to apply.
        </p>

        {updateError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold">
            {updateError}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setShowPrompt(false)}
            disabled={isUpdating}
            className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Later
          </button>
          <button
            type="button"
            onClick={handleApplyUpdate}
            disabled={isUpdating}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-700 hover:to-yellow-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Updating...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-white" />
                <span>Update</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
