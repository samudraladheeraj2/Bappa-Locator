import React from 'react';
import { Sparkles } from 'lucide-react';
import { FestivalType } from '../types';

interface FestivalTabBarProps {
  activeFestival: FestivalType;
  onChangeFestival: (festival: FestivalType) => void;
  ganeshCount?: number;
  durgaCount?: number;
}

export const FestivalTabBar: React.FC<FestivalTabBarProps> = ({
  activeFestival,
  onChangeFestival,
  ganeshCount,
  durgaCount,
}) => {
  return (
    <div className="w-full flex items-center justify-center">
      <div className="bg-amber-950/90 backdrop-blur-md p-1.5 rounded-2xl border border-amber-600/50 shadow-lg flex items-center gap-1.5 max-w-md w-full">
        {/* Ganesh Pandals Tab */}
        <button
          type="button"
          onClick={() => onChangeFestival('ganesh')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
            activeFestival === 'ganesh'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-amber-950 shadow-md shadow-amber-900/40 ring-2 ring-yellow-300/80 scale-[1.02]'
              : 'text-amber-200 hover:text-white hover:bg-amber-900/60'
          }`}
          title="Switch to Ganesh Pandals"
        >
          <span className="text-base sm:text-lg animate-bounce-subtle">🐘</span>
          <span className="truncate">Ganesh Pandals</span>
          {typeof ganeshCount === 'number' && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                activeFestival === 'ganesh'
                  ? 'bg-amber-950 text-yellow-300'
                  : 'bg-amber-900/80 text-amber-300'
              }`}
            >
              {ganeshCount}
            </span>
          )}
        </button>

        {/* Durga Pandals Tab */}
        <button
          type="button"
          onClick={() => onChangeFestival('durga')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
            activeFestival === 'durga'
              ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md shadow-red-950/60 ring-2 ring-rose-400/90 scale-[1.02]'
              : 'text-rose-200 hover:text-white hover:bg-rose-950/60'
          }`}
          title="Switch to Durga Pandals"
        >
          <span className="text-base sm:text-lg animate-pulse">🌺</span>
          <span className="truncate">Durga Pandals</span>
          {typeof durgaCount === 'number' && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                activeFestival === 'durga'
                  ? 'bg-rose-950 text-yellow-300'
                  : 'bg-red-950/80 text-rose-300'
              }`}
            >
              {durgaCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
