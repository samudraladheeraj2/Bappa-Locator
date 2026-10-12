import React from 'react';
import { Menu, MapPin, Navigation, List, Map as MapIcon, Sparkles, PlusCircle, ShieldAlert, Utensils, User as UserIcon } from 'lucide-react';
import { ViewMode, FestivalType } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { CuteDurgaMataLogo } from './CuteDurgaMataLogo';

interface NavbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  festivalType: FestivalType;
  onFestivalTypeChange: (type: FestivalType) => void;
  onGetLocation: () => void;
  onPandalsNearMe?: () => void;
  onAnnadanamNearMe?: () => void;
  isLocating: boolean;
  hasLocation: boolean;
  onOpenSubmit: () => void;
  onOpenAnnadanamModal: () => void;
  onOpenAdmin: () => void;
  onOpenProfile: () => void;
  onOpenDrawer: () => void;
  isAdmin?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  viewMode,
  onViewModeChange,
  festivalType,
  onFestivalTypeChange,
  onGetLocation,
  onPandalsNearMe,
  onAnnadanamNearMe,
  isLocating,
  hasLocation,
  onOpenSubmit,
  onOpenAnnadanamModal,
  onOpenAdmin,
  onOpenProfile,
  onOpenDrawer,
  isAdmin = false,
}) => {
  const isDurga = festivalType === 'durga';

  return (
    <header
      className={`backdrop-blur-md text-white shadow-xl rounded-2xl border transition-colors duration-300 z-50 ${
        isDurga
          ? 'bg-gradient-to-r from-red-950 via-rose-900 to-amber-950 border-rose-500/50 shadow-rose-950/30'
          : 'bg-gradient-to-r from-amber-900 via-amber-800 to-amber-900 border-amber-600/50 shadow-amber-950/30'
      }`}
    >
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          {/* 3-Bar Menu Hamburger Button on Top-Left */}
          <button
            type="button"
            onClick={onOpenDrawer}
            className={`p-2 rounded-xl border shadow-sm active:scale-95 transition-all flex items-center justify-center shrink-0 cursor-pointer ${
              isDurga
                ? 'bg-red-950/80 hover:bg-rose-800 text-yellow-300 border-rose-600/60'
                : 'bg-amber-950/70 hover:bg-amber-700 text-yellow-300 border-amber-600/50'
            }`}
            title="Open Main Menu & Check Updates"
            aria-label="Open 3-bar menu"
          >
            <Menu className="w-5 h-5 text-yellow-300" />
          </button>

          {/* Logo with Cute Animated Durga Mata pic or Cute Ganesha pic */}
          {isDurga ? (
            <CuteDurgaMataLogo
              size="md"
              showBadge={true}
              onClick={() => {}}
            />
          ) : (
            <div className="relative group cursor-pointer" title="Shree Ganesha 🚩">
              <img
                src="/app-icon.png"
                alt="Cute Ganesha Logo"
                className="w-10 h-10 rounded-xl object-cover border-2 border-amber-400 shadow-md shrink-0 shadow-amber-950/40 group-hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
              />
              <span className="absolute -bottom-1 -right-1 text-[9px] bg-amber-950 text-yellow-300 font-black px-1 rounded-md border border-amber-500/70">
                🚩
              </span>
            </div>
          )}

          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-yellow-100 flex items-center gap-1.5">
              Pandal Hopper {isDurga ? '🌺' : '🚩'}{' '}
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-extrabold ${
                  isDurga ? 'bg-rose-950 text-rose-200 border border-rose-700/60' : 'bg-amber-950 text-yellow-200 border border-amber-700/60'
                }`}
              >
                Hyderabad
              </span>
            </h1>
            <p className="text-[11px] sm:text-xs text-amber-200/90 font-medium">
              {isDurga ? 'Durga Puja Pandals & Maha Bhog' : 'Ganesh Pandals & Annadanam'}
            </p>
          </div>
        </div>

        {/* Festival Quick Toggle Capsule in Navbar */}
        <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => onFestivalTypeChange('ganesh')}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              !isDurga
                ? 'bg-amber-500 text-amber-950 shadow-sm font-extrabold scale-[1.02]'
                : 'text-amber-200/80 hover:text-white'
            }`}
            title="Switch to Ganesh Pandals"
          >
            <span>🐘</span>
            <span className="hidden sm:inline">Ganesh</span>
          </button>
          <button
            type="button"
            onClick={() => onFestivalTypeChange('durga')}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              isDurga
                ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-sm font-extrabold scale-[1.02]'
                : 'text-rose-200/80 hover:text-white'
            }`}
            title="Switch to Durga Pandals"
          >
            <span>🌺</span>
            <span className="hidden sm:inline">Durga</span>
          </button>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* My Profile Button */}
          <button
            onClick={onOpenProfile}
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all border shadow-sm ${
              isDurga
                ? 'bg-rose-800 hover:bg-rose-700 border-rose-600'
                : 'bg-amber-700 hover:bg-amber-600 border-amber-600'
            }`}
            title="My Profile & My Pandal"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">My Profile</span>
          </button>

          {/* Admin Panel Button — ONLY visible to authenticated Admins */}
          {isAdmin && (
            <button
              onClick={onOpenAdmin}
              className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-yellow-300 transition-all border shadow-sm animate-in fade-in ${
                isDurga
                  ? 'bg-rose-950 hover:bg-rose-900 border-rose-700/60'
                  : 'bg-amber-950 hover:bg-amber-900 border-amber-700/60'
              }`}
              title="Admin Dashboard & Pending Approvals"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="font-bold">Admin</span>
            </button>
          )}

          {/* Install App PWA Button */}
          <PWAInstallButton />

          {/* Submit Pandal Button */}
          <button
            onClick={onOpenSubmit}
            className={`flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm shrink-0 ${
              isDurga
                ? 'bg-yellow-400 text-rose-950 hover:bg-yellow-300'
                : 'bg-yellow-500 text-amber-950 hover:bg-yellow-400'
            }`}
            title={isDurga ? 'Suggest Durga Pandal' : 'Suggest Pandals/Mandap'}
          >
            <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{isDurga ? 'Suggest Durga Pandal' : 'Suggest Pandals/Mandap'}</span>
          </button>

          {/* Suggest Annadanam / Bhog Button */}
          <button
            onClick={onOpenAnnadanamModal}
            className={`flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all shadow-sm border shrink-0 ${
              isDurga
                ? 'bg-rose-800 hover:bg-rose-700 border-rose-600'
                : 'bg-amber-700 hover:bg-amber-600 border-amber-600'
            }`}
            title={isDurga ? 'Suggest Durga Bhog / Annadanam' : 'Suggest Annadanam'}
          >
            <PlusCircle className="w-3.5 h-3.5 shrink-0 text-yellow-300" />
            <span className="inline font-bold">{isDurga ? 'Suggest Durga Bhog' : 'Suggest Annadanam'}</span>
          </button>

          {/* Pandals near me Button */}
          <button
            onClick={onPandalsNearMe || onGetLocation}
            disabled={isLocating}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              hasLocation && viewMode !== 'annadanam'
                ? 'bg-yellow-500 text-amber-950 font-bold shadow-sm ring-2 ring-yellow-300/60'
                : isDurga
                ? 'bg-rose-950/80 text-rose-100 hover:bg-rose-800 border border-rose-700/50'
                : 'bg-amber-900/80 text-amber-100 hover:bg-amber-700 border border-amber-700/50'
            }`}
            title="Show Pandals closest to your location"
          >
            <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
            <span>
              {isLocating && viewMode !== 'annadanam'
                ? 'Locating...'
                : isDurga
                ? 'Durga Pandals near me'
                : 'Pandals/Mandaps near me'}
            </span>
          </button>

          {/* Annadanam / Bhog near me Button */}
          <button
            onClick={onAnnadanamNearMe || onGetLocation}
            disabled={isLocating}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              hasLocation && viewMode === 'annadanam'
                ? 'bg-yellow-500 text-amber-950 font-bold shadow-sm ring-2 ring-yellow-300/60'
                : isDurga
                ? 'bg-rose-950/80 text-rose-100 hover:bg-rose-800 border border-rose-700/50'
                : 'bg-amber-900/80 text-amber-100 hover:bg-amber-700 border border-amber-700/50'
            }`}
            title="Show Annadanam & Maha Bhog schedules closest to your location"
          >
            <Utensils className={`w-3.5 h-3.5 text-yellow-300 ${isLocating && viewMode === 'annadanam' ? 'animate-spin' : ''}`} />
            <span>
              {isLocating && viewMode === 'annadanam'
                ? 'Locating...'
                : isDurga
                ? 'Maha Bhog near me'
                : 'Annadanam near me'}
            </span>
          </button>

          {/* View Switcher */}
          <div
            className={`p-1 rounded-lg flex border ${
              isDurga ? 'bg-rose-950/70 border-rose-700/50' : 'bg-amber-950/60 border-amber-700/50'
            }`}
          >
            <button
              onClick={() => onViewModeChange('map')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'map'
                  ? isDurga
                    ? 'bg-rose-600 text-white shadow'
                    : 'bg-amber-600 text-white shadow'
                  : 'text-amber-200 hover:text-white'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map</span>
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'list'
                  ? isDurga
                    ? 'bg-rose-600 text-white shadow'
                    : 'bg-amber-600 text-white shadow'
                  : 'text-amber-200 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => onViewModeChange('annadanam')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'annadanam'
                  ? isDurga
                    ? 'bg-rose-600 text-white shadow'
                    : 'bg-amber-600 text-white shadow'
                  : 'text-amber-200 hover:text-white'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>{isDurga ? 'Maha Bhog' : 'Annadanam'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

