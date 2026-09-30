import React from 'react';
import { MapPin, Navigation, Clock, ChevronRight, Sparkles, Heart, Award } from 'lucide-react';
import { Pandal } from '../types';
import { formatDistance } from '../utils/geo';
import { CURRENT_FESTIVAL_YEAR, getCoverPhotoMetadata } from '../utils/yearlyPhotos';

interface PandalListProps {
  pandals: Pandal[];
  distances: { [id: string]: number };
  onSelectPandal: (pandal: Pandal) => void;
  onGetDirections: (pandal: Pandal) => void;
  favorites: string[];
  onToggleFavorite: (pandalId: string) => void;
  showFavoritesOnly: boolean;
  hasLocation?: boolean;
}

export const PandalList: React.FC<PandalListProps> = React.memo(({
  pandals,
  distances,
  onSelectPandal,
  onGetDirections,
  favorites,
  onToggleFavorite,
  showFavoritesOnly,
  hasLocation,
}) => {
  const currentYear = CURRENT_FESTIVAL_YEAR;

  if (pandals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="bg-amber-100 p-4 rounded-full text-amber-800 mb-3">
          <Sparkles className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">
          {showFavoritesOnly ? 'No Favorite Pandals Yet' : 'No Pandals Found'}
        </h3>
        <p className="text-sm text-gray-500 max-w-sm">
          {showFavoritesOnly
            ? 'Click the heart icon on any pandal card or detail view to save it to your favorites.'
            : 'Try adjusting your search query or city filter to discover more Ganesh mandapams.'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-3 pb-24">
      {hasLocation && Object.keys(distances).length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-emerald-600 fill-emerald-600 animate-pulse" />
            <span>Showing nearest Ganesh Pandals & Mandaps to your current location</span>
          </div>
          <span className="text-[10px] bg-emerald-200/80 text-emerald-950 px-2.5 py-0.5 rounded-full font-bold">
            {pandals.length} Pandals
          </span>
        </div>
      )}

      {pandals.map((pandal) => {
        const dist = distances[pandal.id];
        const isFav = favorites.includes(pandal.id);
        const coverMeta = getCoverPhotoMetadata(pandal, currentYear);

        return (
          <div
            key={pandal.id}
            onClick={() => onSelectPandal(pandal)}
            className="bg-white rounded-2xl p-4 border border-amber-100 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between group relative"
          >
            {/* Favorite button top right */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(pandal.id);
              }}
              className={`absolute top-3 right-3 sm:static p-2 rounded-full transition-all cursor-pointer ${
                isFav
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
              }`}
              title={isFav ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-red-600 text-red-600' : ''}`} />
            </button>

            <div className="flex items-start space-x-3.5 flex-1 min-w-0 pr-8 sm:pr-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-amber-900 overflow-hidden flex-shrink-0 relative border border-amber-300 shadow-2xs">
                {coverMeta.coverUrl ? (
                  <img
                    src={coverMeta.coverUrl}
                    alt={pandal.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-amber-800 flex items-center justify-center text-yellow-300 font-bold text-xl">
                    🚩
                  </div>
                )}

                {/* Status Badge on thumbnail */}
                {coverMeta.isCurrentYear ? (
                  <span className="absolute bottom-0 inset-x-0 bg-emerald-950/80 text-emerald-300 text-[8px] font-extrabold text-center py-0.5 backdrop-blur-2xs">
                    {currentYear} Idol
                  </span>
                ) : (
                  <span className="absolute bottom-0 inset-x-0 bg-black/75 text-yellow-300 text-[8px] font-bold text-center py-0.5 backdrop-blur-2xs truncate px-0.5">
                    {coverMeta.year} Photo
                  </span>
                )}

                {pandal.popular && (
                  <span className="absolute top-1 left-1 bg-yellow-500 text-amber-950 text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                    ★
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-base font-bold text-gray-900 group-hover:text-amber-800 transition-colors truncate">
                    {pandal.name}
                  </h3>
                  {dist !== undefined && (
                    <span className="inline-flex items-center gap-1 bg-amber-100/90 text-amber-950 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-300 shadow-2xs">
                      <Navigation className="w-3 h-3 text-amber-700 fill-amber-700" />
                      {formatDistance(dist)}
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-500 flex items-center gap-1 mb-1.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="truncate">{pandal.address}</span>
                </p>

                {/* Yearly Update status indicator */}
                <div className="flex items-center gap-2 text-[11px]">
                  {!coverMeta.isCurrentYear && (
                    <span className="text-[10px] bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-md font-semibold">
                      {coverMeta.fallbackBadge || `Awaiting ${currentYear} Update`}
                    </span>
                  )}
                  {pandal.timings && (
                    <span className="text-gray-400 flex items-center gap-1 truncate">
                      <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                      <span className="truncate">{pandal.timings}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGetDirections(pandal);
                }}
                className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold rounded-xl transition-colors flex items-center space-x-1.5 border border-amber-200 cursor-pointer"
                title="Get directions in Google Maps"
              >
                <Navigation className="w-3.5 h-3.5 text-amber-700 fill-amber-700" />
                <span>Directions</span>
              </button>
              <button
                onClick={() => onSelectPandal(pandal)}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <span>Details</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
});
