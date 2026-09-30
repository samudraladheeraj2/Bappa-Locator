import React, { useState, useEffect } from 'react';
import {
  Menu,
  X,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Smartphone,
  ShieldAlert,
  Utensils,
  User as UserIcon,
  Map as MapIcon,
  List,
  PlusCircle,
  Navigation,
  Heart,
  Info,
  ExternalLink,
  Wifi,
  WifiOff,
  Copy,
  Check,
  Calendar,
  Layers,
} from 'lucide-react';
import { ViewMode } from '../types';
import {
  CURRENT_APP_VERSION,
  CURRENT_VERSION_CODE,
  checkForAppUpdates,
  VersionCheckResult,
} from '../utils/versionCheck';
import { PWAInstallButton } from './PWAInstallButton';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onGetLocation: () => void;
  onPandalsNearMe?: () => void;
  onAnnadanamNearMe?: () => void;
  isLocating: boolean;
  hasLocation: boolean;
  onOpenSubmit: () => void;
  onOpenAnnadanamModal: () => void;
  onOpenAdmin: () => void;
  onOpenProfile: () => void;
  isAdmin?: boolean;
  totalPandals?: number;
  favoritesCount?: number;
  showFavoritesOnly?: boolean;
  onToggleFavoritesOnly?: () => void;
  isOnline?: boolean;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  viewMode,
  onViewModeChange,
  onGetLocation,
  onPandalsNearMe,
  onAnnadanamNearMe,
  isLocating,
  hasLocation,
  onOpenSubmit,
  onOpenAnnadanamModal,
  onOpenAdmin,
  onOpenProfile,
  isAdmin = false,
  totalPandals = 0,
  favoritesCount = 0,
  showFavoritesOnly = false,
  onToggleFavoritesOnly,
  isOnline = true,
}) => {
  // Update Checker State
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<VersionCheckResult | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isOtaUpdating, setIsOtaUpdating] = useState(false);
  const [otaStatus, setOtaStatus] = useState<string | null>(null);

  // Check version on drawer mount
  useEffect(() => {
    if (isOpen && !updateResult) {
      handleCheckUpdates();
    }
  }, [isOpen]);

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    setOtaStatus(null);
    try {
      const res = await checkForAppUpdates();
      setUpdateResult(res);
    } catch (err: any) {
      console.warn('Update check error in drawer:', err);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleDownloadAndInstall = async () => {
    if (!updateResult) return;

    // Check if running inside native Capacitor with Capgo updater
    if (Capacitor.isNativePlatform()) {
      try {
        setIsOtaUpdating(true);
        setOtaStatus('Checking over-the-air package...');
        const latest = await CapacitorUpdater.getLatest();
        if (latest && latest.url && latest.version) {
          setOtaStatus(`Downloading package v${latest.version}...`);
          const versionData = await CapacitorUpdater.download({
            url: latest.url,
            version: latest.version,
          });
          setOtaStatus('Applying bundle & reloading...');
          await CapacitorUpdater.set(versionData);
          await CapacitorUpdater.reload();
          return;
        }
      } catch (err: any) {
        console.warn('Capgo OTA update not applicable, falling back to APK download:', err);
        setOtaStatus(null);
      } finally {
        setIsOtaUpdating(false);
      }
    }

    // Direct APK download/install for Android or browser
    window.open(updateResult.apkUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = () => {
    if (!updateResult?.apkUrl) return;
    navigator.clipboard.writeText(updateResult.apkUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  if (!isOpen) return null;

  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-xl md:max-w-2xl bg-gradient-to-b from-amber-50 via-white to-amber-50/50 h-full shadow-2xl z-10 flex flex-col overflow-hidden text-gray-900 animate-in slide-in-from-left duration-300 border-r border-amber-300/60">
        
        {/* Drawer Header */}
        <div className="bg-gradient-to-r from-amber-900 via-amber-800 to-amber-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-amber-700/60 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-700/90 border border-amber-500/50 flex items-center justify-center shadow-inner">
              <Sparkles className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-yellow-100 tracking-tight flex items-center gap-1.5">
                  Bappa Locator 🚩
                </h2>
                <span className="text-[10px] bg-amber-950/80 text-yellow-300 font-extrabold px-2 py-0.5 rounded-full border border-amber-600/40">
                  Hyderabad
                </span>
              </div>
              <p className="text-xs text-amber-200 font-medium">
                Ganesh Pandals, Live Darshan & Annadanam
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-amber-950/60 hover:bg-amber-700 text-amber-200 hover:text-white transition-colors cursor-pointer border border-amber-700/50"
            title="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body with 2-Column Responsive Layout */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Quick System Badge Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-amber-100/70 border border-amber-300/80 rounded-2xl text-xs">
            <div className="flex items-center gap-2 text-amber-950 font-bold">
              {isOnline ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-800">Online & Live Synced</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-amber-700" />
                  <span className="text-amber-900">Offline (Using local cache)</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] bg-white font-extrabold text-amber-900 px-2.5 py-1 rounded-lg border border-amber-200 shadow-xs">
                {totalPandals} Pandals Live
              </span>
              <span className="text-[11px] bg-amber-800 text-yellow-200 font-extrabold px-2.5 py-1 rounded-lg shadow-xs">
                v{CURRENT_APP_VERSION}
              </span>
            </div>
          </div>

          {/* TWO COLUMNS / SECTIONS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* COLUMN 1: NAVIGATION & APP DETAILS */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900 border-b border-amber-200 pb-1.5">
                <Layers className="w-4 h-4 text-amber-700" />
                <span>App Views & Actions</span>
              </div>

              {/* View Switcher Cards */}
              <div className="space-y-1.5">
                <button
                  onClick={() => {
                    onViewModeChange('map');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all text-left border ${
                    viewMode === 'map'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-md'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MapIcon className="w-4 h-4 text-yellow-400" />
                    <span>Interactive Map View</span>
                  </div>
                  <span className="text-[10px] opacity-80">Full Screen</span>
                </button>

                <button
                  onClick={() => {
                    onViewModeChange('list');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all text-left border ${
                    viewMode === 'list'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-md'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <List className="w-4 h-4 text-amber-600" />
                    <span>Pandal Directory (List)</span>
                  </div>
                  <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-bold">
                    {totalPandals}
                  </span>
                </button>

                <button
                  onClick={() => {
                    onViewModeChange('annadanam');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all text-left border ${
                    viewMode === 'annadanam'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-md'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Utensils className="w-4 h-4 text-yellow-600" />
                    <span>Annadanam & Prasadam Schedules</span>
                  </div>
                  <span className="text-[10px] bg-yellow-100 text-amber-950 px-2 py-0.5 rounded-md font-bold">
                    Live
                  </span>
                </button>
              </div>

              {/* Location Proximity Triggers */}
              <div className="space-y-1.5 pt-1">
                <button
                  onClick={() => {
                    if (onPandalsNearMe) onPandalsNearMe();
                    else onGetLocation();
                    onClose();
                  }}
                  disabled={isLocating}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold bg-white border border-gray-200 hover:bg-amber-50 text-gray-800 transition-all text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Navigation className={`w-4 h-4 text-amber-700 ${isLocating ? 'animate-spin' : ''}`} />
                    <span>Find Pandals Near Me</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">GPS</span>
                </button>

                <button
                  onClick={() => {
                    if (onAnnadanamNearMe) onAnnadanamNearMe();
                    else onGetLocation();
                    onClose();
                  }}
                  disabled={isLocating}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold bg-white border border-gray-200 hover:bg-amber-50 text-gray-800 transition-all text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Utensils className="w-4 h-4 text-amber-700" />
                    <span>Find Annadanam Near Me</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">GPS</span>
                </button>

                {onToggleFavoritesOnly && (
                  <button
                    onClick={() => {
                      onToggleFavoritesOnly();
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold border transition-all text-left ${
                      showFavoritesOnly
                        ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                        : 'bg-white text-gray-800 border-gray-200 hover:bg-rose-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Heart className={`w-4 h-4 ${showFavoritesOnly ? 'fill-rose-500 text-rose-500' : 'text-rose-500'}`} />
                      <span>Saved Favorites</span>
                    </div>
                    <span className="text-[10px] bg-rose-100 text-rose-900 px-2 py-0.5 rounded-md font-bold">
                      {favoritesCount}
                    </span>
                  </button>
                )}
              </div>

              {/* Devotee Contribution & Profile */}
              <div className="space-y-1.5 pt-1">
                <button
                  onClick={() => {
                    onOpenSubmit();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-amber-950 transition-all text-left shadow-sm"
                >
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>Suggest New Pandal / Mandap</span>
                </button>

                <button
                  onClick={() => {
                    onOpenAnnadanamModal();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold bg-amber-700 hover:bg-amber-600 text-white transition-all text-left shadow-sm"
                >
                  <Utensils className="w-4 h-4 shrink-0 text-yellow-300" />
                  <span>Suggest Annadanam Schedule</span>
                </button>

                <button
                  onClick={() => {
                    onOpenProfile();
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold bg-white border border-gray-200 hover:bg-amber-50 text-gray-800 transition-all text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <UserIcon className="w-4 h-4 text-amber-700" />
                    <span>My Profile & Pandals</span>
                  </div>
                  <span className="text-[10px] text-gray-500">Dual Auth</span>
                </button>

                {isAdmin && (
                  <button
                    onClick={() => {
                      onOpenAdmin();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold bg-amber-950 text-yellow-300 hover:bg-amber-900 transition-all border border-amber-700/80 shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-yellow-400" />
                      <span>Admin Approval Panel</span>
                    </div>
                    <span className="text-[10px] bg-amber-800 text-yellow-200 px-2 py-0.5 rounded-md font-bold">
                      Admin
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* COLUMN 2: CHECK THE UPDATES (EXPLICIT USER REQUEST) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-900 border-b border-amber-200 pb-1.5">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-700" />
                  <span>Check for Updates</span>
                </div>
                <button
                  onClick={handleCheckUpdates}
                  disabled={isCheckingUpdate}
                  className="flex items-center gap-1 text-[11px] text-amber-800 hover:text-amber-950 font-bold bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                  title="Check latest version"
                >
                  <RefreshCw className={`w-3 h-3 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {/* Version & App Identity Card */}
              <div className="bg-gradient-to-br from-amber-100/90 to-yellow-50 border border-amber-300/80 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-900">
                      Installed Version
                    </span>
                    <div className="text-xl font-black text-amber-950 flex items-center gap-2">
                      v{CURRENT_APP_VERSION}
                      <span className="text-[10px] font-bold text-gray-500 bg-white/80 px-2 py-0.5 rounded border border-amber-200">
                        Build #{CURRENT_VERSION_CODE}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-amber-200 shadow-xs">
                    <Smartphone className="w-6 h-6 text-amber-700" />
                  </div>
                </div>

                <div className="text-xs text-amber-900/80 font-medium">
                  {isNative ? (
                    <span className="text-emerald-800 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Running as Android Native App
                    </span>
                  ) : (
                    <span className="text-blue-900 font-bold flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-blue-600" /> Running as Web / PWA App
                    </span>
                  )}
                </div>
              </div>

              {/* Update Check Results Card */}
              <div className="space-y-3">
                {isCheckingUpdate ? (
                  <div className="p-4 bg-white border border-amber-200 rounded-2xl flex flex-col items-center justify-center text-center space-y-2 py-6">
                    <RefreshCw className="w-7 h-7 text-amber-600 animate-spin" />
                    <p className="text-xs font-bold text-gray-800">Checking for latest update...</p>
                    <p className="text-[11px] text-gray-500">Contacting release repository</p>
                  </div>
                ) : updateResult?.hasUpdate ? (
                  /* Update Available UI */
                  <div className="bg-gradient-to-br from-emerald-50 to-amber-50 border-2 border-emerald-500/80 rounded-2xl p-4 space-y-3 shadow-md animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                        <Download className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-emerald-950">
                            New Update Available!
                          </h4>
                          <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded-full">
                            v{updateResult.latestVersion}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">
                          A newer build has been released with improvements.
                        </p>
                      </div>
                    </div>

                    {updateResult.releaseNotes && (
                      <div className="bg-white/80 p-3 rounded-xl border border-emerald-200 text-xs text-gray-800 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-emerald-900 tracking-wider">
                          What's New in v{updateResult.latestVersion}:
                        </span>
                        <p className="text-[11px] text-gray-700 leading-relaxed">
                          {updateResult.releaseNotes}
                        </p>
                      </div>
                    )}

                    {otaStatus && (
                      <div className="text-xs text-amber-900 bg-amber-100/90 p-2 rounded-lg font-medium animate-pulse">
                        {otaStatus}
                      </div>
                    )}

                    <div className="space-y-2 pt-1">
                      <button
                        onClick={handleDownloadAndInstall}
                        disabled={isOtaUpdating}
                        className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-60"
                      >
                        {isOtaUpdating ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin text-white" />
                            <span>Applying Update...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 text-white" />
                            <span>Install Update (Download APK)</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleCopyLink}
                        className="w-full py-2 px-3 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-semibold text-[11px] rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {copiedLink ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700 font-bold">APK Download Link Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-gray-500" />
                            <span>Copy APK Direct Download Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Up to date UI */
                  <div className="bg-white border border-emerald-300/80 rounded-2xl p-4 space-y-2.5 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">
                          Your App is Up to Date!
                        </h4>
                        <p className="text-[11px] text-gray-500">
                          v{CURRENT_APP_VERSION} is the latest released build.
                        </p>
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-between text-[11px] text-gray-500 border-t border-gray-100">
                      <span>Status: Verified</span>
                      <span>
                        {updateResult?.checkedAt
                          ? `Checked: ${new Date(updateResult.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : 'Checked just now'}
                      </span>
                    </div>

                    <button
                      onClick={handleCheckUpdates}
                      className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs rounded-xl border border-amber-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-amber-700" />
                      <span>Check Again</span>
                    </button>
                  </div>
                )}

                {/* Release Repository Link */}
                <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 space-y-1.5 text-xs">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    Release Information
                  </span>
                  <p className="text-[11px] text-gray-600 leading-snug">
                    New APK builds are compiled on GitHub Releases with automated cloud CI/CD.
                  </p>
                  <a
                    href="https://github.com/samudraladheeraj2/Bappa-Locator/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-amber-700 hover:text-amber-900 font-bold text-[11px] mt-1"
                  >
                    <span>View GitHub Releases & Changelog</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* About / Devotion Footer */}
          <div className="pt-4 border-t border-amber-200/80 text-center space-y-1 text-xs text-gray-600">
            <p className="font-extrabold text-amber-950 flex items-center justify-center gap-1.5">
              <span>🌺</span> || गणपती बाप्पा मोरया || <span>🌺</span>
            </p>
            <p className="text-[11px] text-gray-500">
              Bappa Locator Hyderabad • Developed for Ganesh Utsav Devotees
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
