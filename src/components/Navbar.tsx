import React from 'react';
import { MapPin, Navigation, List, Map as MapIcon, Sparkles, PlusCircle, ShieldAlert, Utensils, User as UserIcon } from 'lucide-react';
import { ViewMode } from '../types';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
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
}

export const Navbar: React.FC<NavbarProps> = ({
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
}) => {
  return (
    <header className="bg-amber-800/95 backdrop-blur-md text-white shadow-xl rounded-2xl border border-amber-600/40 z-50">
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <div className="bg-amber-700 p-2 rounded-xl border border-amber-600 shadow-inner flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-yellow-300" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-yellow-100 flex items-center gap-1.5">
              Bappa Locator 🚩 <span className="text-[10px] bg-amber-900 px-2 py-0.5 rounded text-yellow-200">Hyderabad</span>
            </h1>
            <p className="text-xs text-amber-200">Ganesh Pandals & Annadanam</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* My Profile Button */}
          <button
            onClick={onOpenProfile}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 hover:bg-amber-600 text-white transition-all border border-amber-600 shadow-sm"
            title="My Profile & My Pandal"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">My Profile</span>
          </button>

          {/* Admin Panel Button — ONLY visible to authenticated Admins */}
          {isAdmin && (
            <button
              onClick={onOpenAdmin}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-950 text-yellow-300 hover:bg-amber-900 transition-all border border-amber-700/60 shadow-sm animate-in fade-in"
              title="Admin Dashboard & Pending Approvals"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="font-bold">Admin</span>
            </button>
          )}

          {/* Install App PWA Button */}
          <PWAInstallButton />

          {/* Submit Pandal / Mandap Button */}
          <button
            onClick={onOpenSubmit}
            className="flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500 text-amber-950 hover:bg-yellow-400 transition-all shadow-sm shrink-0"
            title="Suggest Pandals/Mandap"
          >
            <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="font-bold">Suggest Pandals/Mandap</span>
          </button>

          {/* Suggest Annadanam Button */}
          <button
            onClick={onOpenAnnadanamModal}
            className="flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 hover:bg-amber-600 text-white transition-all shadow-sm border border-amber-600 shrink-0"
            title="Suggest Annadanam"
          >
            <Utensils className="w-3.5 h-3.5 shrink-0 text-yellow-300" />
            <span className="inline font-bold">Suggest Annadanam</span>
          </button>

          {/* Pandals/Mandaps near me Button */}
          <button
            onClick={onPandalsNearMe || onGetLocation}
            disabled={isLocating}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              hasLocation && viewMode !== 'annadanam'
                ? 'bg-yellow-500 text-amber-950 font-bold shadow-sm ring-2 ring-yellow-300/60'
                : 'bg-amber-900/80 text-amber-100 hover:bg-amber-700 border border-amber-700/50'
            }`}
            title="Show Pandals & Mandaps closest to your location"
          >
            <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
            <span>
              {isLocating && viewMode !== 'annadanam' ? 'Locating...' : 'Pandals/Mandaps near me'}
            </span>
          </button>

          {/* Annadanam near me Button */}
          <button
            onClick={onAnnadanamNearMe || onGetLocation}
            disabled={isLocating}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
              hasLocation && viewMode === 'annadanam'
                ? 'bg-yellow-500 text-amber-950 font-bold shadow-sm ring-2 ring-yellow-300/60'
                : 'bg-amber-900/80 text-amber-100 hover:bg-amber-700 border border-amber-700/50'
            }`}
            title="Show Annadanam & Maha Prasadam schedules closest to your location"
          >
            <Utensils className={`w-3.5 h-3.5 text-yellow-300 ${isLocating && viewMode === 'annadanam' ? 'animate-spin' : ''}`} />
            <span>
              {isLocating && viewMode === 'annadanam' ? 'Locating...' : 'Annadanam near me'}
            </span>
          </button>

          {/* View Switcher */}
          <div className="bg-amber-950/60 p-1 rounded-lg flex border border-amber-700/50">
            <button
              onClick={() => onViewModeChange('map')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'map'
                  ? 'bg-amber-600 text-white shadow'
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
                  ? 'bg-amber-600 text-white shadow'
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
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-amber-200 hover:text-white'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Annadanam</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
