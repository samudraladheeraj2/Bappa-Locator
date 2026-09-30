import React from 'react';
import {
  X,
  Sparkles,
  ShieldAlert,
  Utensils,
  User as UserIcon,
  Map as MapIcon,
  List,
  PlusCircle,
  Navigation,
  Heart,
  Wifi,
  WifiOff,
  Layers,
  Clock,
  Compass,
  RefreshCw,
  Download,
} from 'lucide-react';
import { ViewMode } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { CURRENT_APP_VERSION, checkForAppUpdates } from '../utils/versionCheck';

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
  const [checkingUpdate, setCheckingUpdate] = React.useState(false);
  const [updateResult, setUpdateResult] = React.useState<any>(null);
  const [upToDateMsg, setUpToDateMsg] = React.useState(false);

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateResult(null);
    setUpToDateMsg(false);
    
    const result = await checkForAppUpdates();
    setCheckingUpdate(false);
    
    if (result.hasUpdate) {
      setUpdateResult(result);
    } else {
      setUpToDateMsg(true);
      setTimeout(() => setUpToDateMsg(false), 4000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-xl md:max-w-2xl bg-gradient-to-b from-amber-50 via-white to-amber-50/50 h-full shadow-2xl z-10 flex flex-col overflow-hidden text-gray-900 animate-in slide-in-from-left duration-300 border-r border-amber-300/60">
        
        {/* Drawer Header with Cute Bappa Animated Photo */}
        <div className="bg-gradient-to-r from-amber-900 via-amber-800 to-amber-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-amber-700/60 shadow-md">
          <div className="flex items-center gap-3">
            <img
              src="/app-icon.png"
              alt="Cute Bappa Animated Icon"
              className="w-12 h-12 rounded-2xl object-cover border-2 border-amber-300 shadow-md shadow-amber-950/50 shrink-0"
              referrerPolicy="no-referrer"
            />
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
          
          {/* Quick System Badge Bar (Clean, No Release Info) */}
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
              <span className="text-[11px] bg-white font-extrabold text-amber-900 px-3 py-1 rounded-lg border border-amber-200 shadow-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>{totalPandals} Pandals Live</span>
              </span>
            </div>
          </div>

          {/* TWO COLUMNS / SECTIONS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* COLUMN 1: NAVIGATION & APP VIEWS */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900 border-b border-amber-200 pb-1.5">
                <Layers className="w-4 h-4 text-amber-700" />
                <span>Views & Filters</span>
              </div>

              {/* View Switcher Cards */}
              <div className="space-y-1.5">
                <button
                  onClick={() => {
                    onViewModeChange('map');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all text-left border cursor-pointer ${
                    viewMode === 'map'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-md'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MapIcon className={`w-4 h-4 ${viewMode === 'map' ? 'text-yellow-300' : 'text-amber-700'}`} />
                    <span>Interactive Map View</span>
                  </div>
                  <span className="text-[10px] opacity-80 font-medium">Full Map</span>
                </button>

                <button
                  onClick={() => {
                    onViewModeChange('list');
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all text-left border cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-md'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <List className={`w-4 h-4 ${viewMode === 'list' ? 'text-yellow-300' : 'text-amber-700'}`} />
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
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all text-left border cursor-pointer ${
                    viewMode === 'annadanam'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-md'
                      : 'bg-white text-gray-800 border-gray-200 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Utensils className={`w-4 h-4 ${viewMode === 'annadanam' ? 'text-yellow-300' : 'text-yellow-600'}`} />
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
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold bg-white border border-gray-200 hover:bg-amber-50 text-gray-800 transition-all text-left cursor-pointer"
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
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold bg-white border border-gray-200 hover:bg-amber-50 text-gray-800 transition-all text-left cursor-pointer"
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
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold border transition-all text-left cursor-pointer ${
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
            </div>

            {/* COLUMN 2: DEVOTEE SERVICES & COMMUNITY */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900 border-b border-amber-200 pb-1.5">
                <Compass className="w-4 h-4 text-amber-700" />
                <span>Community & Devotee Services</span>
              </div>

              {/* Devotee Actions */}
              <div className="space-y-1.5">
                <button
                  onClick={() => {
                    onOpenSubmit();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-amber-950 transition-all text-left shadow-sm cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>Suggest New Pandal / Mandap</span>
                </button>

                <button
                  onClick={() => {
                    onOpenAnnadanamModal();
                    onClose();
                  }}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-xs font-bold bg-amber-700 hover:bg-amber-600 text-white transition-all text-left shadow-sm cursor-pointer"
                >
                  <Utensils className="w-4 h-4 shrink-0 text-yellow-300" />
                  <span>Suggest Annadanam Schedule</span>
                </button>

                <button
                  onClick={() => {
                    onOpenProfile();
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold bg-white border border-gray-200 hover:bg-amber-50 text-gray-800 transition-all text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <UserIcon className="w-4 h-4 text-amber-700" />
                    <span>My Profile & Saved Pandals</span>
                  </div>
                  <span className="text-[10px] text-gray-500">Dual Auth</span>
                </button>

                {isAdmin && (
                  <button
                    onClick={() => {
                      onOpenAdmin();
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold bg-amber-950 text-yellow-300 hover:bg-amber-900 transition-all border border-amber-700/80 shadow-sm cursor-pointer"
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

              {/* Devotee Guide Card */}
              <div className="bg-gradient-to-br from-amber-100/90 to-yellow-50 border border-amber-300/80 rounded-2xl p-4 space-y-2.5 shadow-xs">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-800" />
                  <h4 className="text-xs font-bold text-amber-950">Daily Aarti & Darshan Timings</h4>
                </div>
                <p className="text-[11px] text-amber-900/90 leading-relaxed font-medium">
                  Morning Aarti generally commences between <strong>7:30 AM – 9:00 AM</strong> and Maha Evening Aarti between <strong>7:00 PM – 8:30 PM</strong> across Hyderabad pandals.
                </p>
                <div className="pt-1 border-t border-amber-200/80 flex items-center justify-between text-[10px] text-amber-800 font-semibold">
                  <span>🚩 Khairatabad • Balapur • Old City</span>
                  <span>Free & Open to All</span>
                </div>
              </div>

              {/* Install PWA Button */}
              <div className="pt-1">
                <PWAInstallButton />
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 bg-amber-100/90 border-t border-amber-200 text-center space-y-3.5">
          {/* Version & Update Checker Panel */}
          <div className="bg-white/80 border border-amber-200 p-3 rounded-2xl shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-amber-950">
              <span className="bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 text-[10px]">
                App Version: v{CURRENT_APP_VERSION}
              </span>
              <button
                type="button"
                onClick={handleCheckUpdates}
                disabled={checkingUpdate}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-800 hover:bg-amber-950 text-white font-bold active:scale-95 transition-all text-[11px] disabled:opacity-60 cursor-pointer shadow-sm shadow-amber-950/20"
              >
                <RefreshCw className={`w-3 h-3 ${checkingUpdate ? 'animate-spin' : ''}`} />
                <span>Check for Updates</span>
              </button>
            </div>

            {/* Checker State Renderings */}
            {checkingUpdate && (
              <div className="text-[11px] text-amber-800 font-bold flex items-center justify-center gap-1.5 animate-pulse py-1">
                <span className="w-2.5 h-2.5 border-2 border-amber-800 border-t-transparent rounded-full animate-spin" />
                <span>Contacting update servers...</span>
              </div>
            )}

            {upToDateMsg && (
              <div className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200 py-1.5 px-3 rounded-xl font-bold text-center animate-bounce">
                ✨ App is already up to date! (v{CURRENT_APP_VERSION})
              </div>
            )}

            {updateResult && updateResult.hasUpdate && (
              <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-400 p-3 rounded-xl text-left space-y-2 animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-950 flex items-center gap-1">
                    🚀 New Update Available: v{updateResult.latestVersion}
                  </span>
                  <span className="text-[10px] bg-amber-900 text-yellow-100 font-extrabold px-1.5 py-0.5 rounded">
                    NEW
                  </span>
                </div>
                {updateResult.releaseNotes && (
                  <p className="text-[10px] text-amber-900 leading-normal font-semibold">
                    {updateResult.releaseNotes}
                  </p>
                )}
                <a
                  href={updateResult.apkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-950/20 active:scale-95 transition-all text-center"
                >
                  <Download className="w-4 h-4 animate-bounce" />
                  <span>Download & Install APK</span>
                </a>
              </div>
            )}

            {updateResult && updateResult.error && (
              <div className="text-[10px] text-rose-700 font-semibold bg-rose-50 border border-rose-200 p-2 rounded-xl text-center">
                ⚠️ {updateResult.error}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-extrabold text-amber-950 flex items-center justify-center gap-1.5">
              <span>🙏 Ganpati Bappa Morya!</span>
              <span>🚩</span>
            </p>
            <p className="text-[10px] text-amber-800/80 mt-0.5">
              Community-driven Ganesh Mandapam & Annadanam Finder for Hyderabad
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
