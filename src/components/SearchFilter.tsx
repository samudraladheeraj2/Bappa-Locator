import React from 'react';
import { Search, X, ArrowUpDown, Heart } from 'lucide-react';

interface SearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortByDistance: boolean;
  onSortToggle: () => void;
  hasLocation: boolean;
  totalCount: number;
  filteredCount: number;
  showFavoritesOnly: boolean;
  onFavoritesToggle: () => void;
  favoritesCount: number;
}

export const SearchFilter: React.FC<SearchFilterProps> = React.memo(({
  searchQuery,
  onSearchChange,
  sortByDistance,
  onSortToggle,
  hasLocation,
  totalCount,
  filteredCount,
  showFavoritesOnly,
  onFavoritesToggle,
  favoritesCount,
}) => {
  return (
    <div className="bg-white/95 backdrop-blur-md border border-amber-200/90 shadow-xl rounded-2xl px-4 py-2.5 z-40">
      <div className="max-w-4xl mx-auto space-y-2">
        {/* Search Input */}
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-amber-600 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by pandal name, area, locality, or committee..."
            className="w-full pl-10 pr-10 py-2.5 bg-amber-50/50 border border-amber-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-amber-100/50"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filters and Sorting (Clean row without city names) */}
        <div className="flex items-center justify-between text-xs pt-1 flex-wrap gap-2">
          {/* Favorites Filter Pill */}
          <button
            onClick={onFavoritesToggle}
            className={`px-3 py-1 rounded-full font-medium transition-all whitespace-nowrap flex items-center space-x-1 ${
              showFavoritesOnly
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-red-50 text-red-800 border border-red-200 hover:bg-red-100'
            }`}
          >
            <Heart className={`w-3 h-3 ${showFavoritesOnly ? 'fill-white' : ''}`} />
            <span>Favorites ({favoritesCount})</span>
          </button>

          {/* Result count & Nearby Sort */}
          <div className="flex items-center space-x-2 ml-auto">
            <span className="text-gray-500 font-medium">
              Showing <strong className="text-amber-900">{filteredCount}</strong> of {totalCount}
            </span>

            {hasLocation && (
              <button
                onClick={onSortToggle}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg border font-medium transition-all ${
                  sortByDistance
                    ? 'bg-amber-100 text-amber-900 border-amber-400 font-semibold'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
                title="Sort by nearest distance"
              >
                <ArrowUpDown className="w-3 h-3 text-amber-700" />
                <span>Nearest First</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
