import React, { useEffect, useState } from 'react';
import { Download, Sparkles, X, ShieldAlert, Smartphone, ExternalLink } from 'lucide-react';

export const CURRENT_APP_VERSION = '1.2.0';

// Configurable URL pointing to raw version.json on GitHub or public host
const VERSION_CHECK_URL =
  'https://raw.githubusercontent.com/samudraladheeraj2/Bappa-Locator/main/version.json';

interface VersionInfo {
  latestVersion: string;
  versionCode?: number;
  apkUrl: string;
  releaseNotes?: string;
  forceUpdate?: boolean;
}

function parseSemver(v: string): number[] {
  return v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
}

function isVersionNewer(latest: string, current: string): boolean {
  const [lMaj = 0, lMin = 0, lPat = 0] = parseSemver(latest);
  const [cMaj = 0, cMin = 0, cPat = 0] = parseSemver(current);

  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

export const AndroidInAppUpdateChecker: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [showModal, setShowPromptModal] = useState(false);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Try fetching from GitHub raw URL first, fallback to local /version.json
        let res: Response | null = null;
        try {
          res = await fetch(VERSION_CHECK_URL, { cache: 'no-cache' });
        } catch {
          res = null;
        }

        if (!res || !res.ok) {
          res = await fetch('/version.json', { cache: 'no-cache' });
        }

        if (res && res.ok) {
          const data: VersionInfo = await res.json();
          if (data && data.latestVersion && isVersionNewer(data.latestVersion, CURRENT_APP_VERSION)) {
            setUpdateInfo(data);
            setShowPromptModal(true);
          }
        }
      } catch (err) {
        console.warn('Android version check note:', err);
      }
    };

    checkVersion();
  }, []);

  const handleDownloadAndInstall = () => {
    if (!updateInfo || !updateInfo.apkUrl) return;

    // Trigger direct download of new APK file URL
    window.open(updateInfo.apkUrl, '_blank', 'noopener,noreferrer');
  };

  if (!showModal || !updateInfo) return null;

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-amber-400 text-gray-900 space-y-4 relative overflow-hidden">
        {/* Background gradient aura */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-400/20 rounded-full blur-xl pointer-events-none" />

        {!updateInfo.forceUpdate && (
          <button
            type="button"
            onClick={() => setShowPromptModal(false)}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-100 text-amber-900 rounded-2xl border border-amber-300">
            <Smartphone className="w-7 h-7 text-amber-700" />
          </div>
          <div>
            <h3 className="font-extrabold text-lg text-amber-950 leading-tight">
              Android App Update Available!
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] bg-emerald-100 text-emerald-900 font-extrabold px-2 py-0.5 rounded-md border border-emerald-300">
                v{updateInfo.latestVersion} Available
              </span>
              <span className="text-[10px] text-gray-500 font-semibold">
                (Installed: v{CURRENT_APP_VERSION})
              </span>
            </div>
          </div>
        </div>

        {updateInfo.releaseNotes && (
          <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-amber-900 tracking-wider">
              What's New in v{updateInfo.latestVersion}:
            </span>
            <p className="text-xs text-amber-950 leading-relaxed font-medium">
              {updateInfo.releaseNotes}
            </p>
          </div>
        )}

        <p className="text-xs text-gray-600 leading-snug">
          Tap <strong>Download & Install APK</strong> below to download the latest APK file and update your app.
        </p>

        <div className="flex items-center gap-2 pt-1">
          {!updateInfo.forceUpdate && (
            <button
              type="button"
              onClick={() => setShowPromptModal(false)}
              className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Later
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadAndInstall}
            className="flex-1 py-3 px-4 bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 hover:from-amber-700 hover:to-yellow-700 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Download className="w-4 h-4 text-white" />
            <span>Download & Install APK</span>
            <ExternalLink className="w-3.5 h-3.5 text-yellow-200" />
          </button>
        </div>
      </div>
    </div>
  );
};
