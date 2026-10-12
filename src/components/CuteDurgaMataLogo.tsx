import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

interface CuteDurgaMataLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  showBadge?: boolean;
}

export const CuteDurgaMataLogo: React.FC<CuteDurgaMataLogoProps> = ({
  className = '',
  size = 'md',
  onClick,
  showBadge = true,
}) => {
  const [imgError, setImgError] = useState(false);
  const [isSparkling, setIsSparkling] = useState(false);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  }[size];

  const handleClick = () => {
    setIsSparkling(true);
    setTimeout(() => setIsSparkling(false), 1200);
    if (onClick) onClick();
  };

  return (
    <div
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center cursor-pointer group select-none ${className}`}
      title="Jai Mata Di! 🌺 Cute Maa Durga"
    >
      {/* Animated Divine Radiant Aura Glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-amber-400 via-rose-500 to-yellow-300 blur-xs opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 animate-pulse" />

      {/* Floating Divine Sparkle Particles */}
      <div className="absolute -top-1.5 -right-1.5 text-yellow-300 pointer-events-none animate-bounce z-10">
        <Sparkles className="w-3.5 h-3.5 fill-yellow-300 drop-shadow-[0_0_4px_rgba(253,224,71,0.8)]" />
      </div>

      {/* Main Avatar Container */}
      <div
        className={`${sizeClasses} relative rounded-2xl overflow-hidden border-2 border-yellow-300/90 shadow-lg shadow-rose-950/40 bg-gradient-to-br from-rose-900 via-red-800 to-amber-950 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 active:scale-95 ${
          isSparkling ? 'ring-4 ring-yellow-400 animate-spin-once' : ''
        }`}
      >
        {!imgError ? (
          <img
            src="/durga-avatar.jpg"
            alt="Cute Animated Durga Mata"
            className="w-full h-full object-cover object-top hover:scale-110 transition-transform duration-500"
            onError={() => setImgError(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          /* High-fidelity Vector Chibi Durga Avatar Fallback */
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-rose-600 to-red-800 text-white relative">
            <span className="text-xl">🌺</span>
            <div className="absolute bottom-0 text-[8px] font-black text-yellow-300 leading-none">MATA</div>
          </div>
        )}

        {/* Shimmer Light Reflection Bar */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Cute Festive Mini Tag */}
      {showBadge && (
        <span className="absolute -bottom-1 -right-1 text-[9px] bg-gradient-to-r from-red-600 to-rose-700 text-yellow-200 font-extrabold px-1 rounded-md border border-yellow-300/80 shadow-xs pointer-events-none">
          🔱
        </span>
      )}
    </div>
  );
};
