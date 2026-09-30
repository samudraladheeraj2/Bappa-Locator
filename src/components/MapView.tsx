import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Pandal } from '../types';
import { Navigation, MapPin, X, ChevronRight } from 'lucide-react';
import { getCoverPhotoMetadata } from '../utils/yearlyPhotos';

// ============================================================================
// STABLE STATIC OPTION DECLARATIONS (Guideline 2)
// Declared outside parent components to ensure absolute reference stability.
// ============================================================================
const MAP_TILES_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const MAP_TILES_CONFIG = {
  subdomains: 'abcd',
  maxZoom: 20,
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
};

const DEFAULT_CENTER_LAT = 17.3850;
const DEFAULT_CENTER_LNG = 78.4867;

// ============================================================================
// STANDALONE SUB-COMPONENTS (Guideline 1 & 5)
// Extracted out of the parent render tree to prevent layout recalculation flashes.
// ============================================================================

interface PandalPreviewCardProps {
  pandal: Pandal;
  distances: { [id: string]: number };
  onClose: () => void;
  onViewDetails: (pandal: Pandal) => void;
  onGetDirections: (pandal: Pandal) => void;
}

export const PandalPreviewCard: React.FC<PandalPreviewCardProps> = React.memo(({
  pandal,
  distances,
  onClose,
  onViewDetails,
  onGetDirections,
}) => {
  const coverMeta = getCoverPhotoMetadata(pandal);
  return (
    <div className="absolute bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-[1100] animate-in slide-in-from-bottom duration-200">
      <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-amber-200 p-4 space-y-3">
        <div className="flex items-start gap-3">
          {/* Photo Thumbnail */}
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-amber-100 shrink-0 border border-amber-200 shadow-xs relative">
            {coverMeta.coverUrl ? (
              <img
                src={coverMeta.coverUrl}
                alt={pandal.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">
                🚩
              </div>
            )}
            {coverMeta.isCurrentYear ? (
              <span className="absolute bottom-0 inset-x-0 bg-emerald-950/80 text-emerald-300 text-[8px] font-bold text-center py-0.5">
                {coverMeta.year} Idol
              </span>
            ) : (
              <span className="absolute bottom-0 inset-x-0 bg-black/70 text-yellow-300 text-[8px] font-bold text-center py-0.5 truncate px-0.5">
                {coverMeta.year} Photo
              </span>
            )}
          </div>

          {/* Text Info */}
          <div className="flex-1 min-w-0 pr-6 relative">
            <button
              type="button"
              onClick={onClose}
              className="absolute -top-1 -right-1 p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="font-extrabold text-base text-gray-950 truncate leading-snug">
              {pandal.name}
            </h3>
            <p className="text-xs font-semibold text-amber-800 truncate">
              {pandal.committeeName || pandal.area}
            </p>

            <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span className="truncate">{pandal.address}</span>
              </span>
            </div>

            {distances[pandal.id] !== undefined && (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                  📍 {distances[pandal.id].toFixed(1)} km away
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Action Buttons (Uber ride style) */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100">
          <button
            type="button"
            onClick={() => onGetDirections(pandal)}
            className="py-3 px-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Navigation className="w-4 h-4" />
            <span>Get Directions</span>
          </button>

          <button
            type="button"
            onClick={() => onViewDetails(pandal)}
            className="py-3 px-4 bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-amber-300 shadow-xs active:scale-95 cursor-pointer"
          >
            <span>View Details</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

interface NearbyPandalsCarouselProps {
  pandals: Pandal[];
  distances: { [id: string]: number };
  onCardClick: (pandal: Pandal) => void;
}

export const NearbyPandalsCarousel: React.FC<NearbyPandalsCarouselProps> = React.memo(({
  pandals,
  distances,
  onCardClick,
}) => {
  return (
    <div className="absolute bottom-3 left-3 right-3 sm:left-6 sm:right-auto sm:max-w-md z-[1050]">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-amber-200 p-2.5 space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Nearby Mandapams ({pandals.length})</span>
          </div>
          <span className="text-[10px] text-gray-500 font-medium">Tap pin or card</span>
        </div>

        {/* Horizontal Scroll of Pandals */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none snap-x">
          {pandals.slice(0, 10).map((pandal) => (
            <div
              key={pandal.id}
              onClick={() => onCardClick(pandal)}
              className="w-48 shrink-0 bg-amber-50/60 hover:bg-amber-100/70 border border-amber-200/80 rounded-xl p-2 cursor-pointer transition-all snap-start flex items-center gap-2 active:scale-95"
            >
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-amber-200 shrink-0">
                {pandal.image ? (
                  <img src={pandal.image} alt={pandal.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm">🚩</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900 truncate leading-tight">{pandal.name}</p>
                <p className="text-[10px] text-gray-500 truncate">{pandal.area}</p>
                {distances[pandal.id] !== undefined && (
                  <p className="text-[10px] font-bold text-amber-800">
                    {distances[pandal.id].toFixed(1)} km
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// MAIN MAP COMPONENT (Memoized with stable dependency loops audited)
// ============================================================================

interface MapViewProps {
  pandals: Pandal[];
  selectedPandal: Pandal | null;
  onSelectPandal: (pandal: Pandal) => void;
  userLocation: { latitude: number; longitude: number } | null;
  distances?: { [id: string]: number };
  onGetDirections?: (pandal: Pandal) => void;
  onGetLocation?: () => void;
  onLocateMe?: () => void;
  isLocating?: boolean;
}

export const MapView: React.FC<MapViewProps> = React.memo(({
  pandals,
  selectedPandal,
  onSelectPandal,
  userLocation,
  distances = {},
  onGetDirections,
  onGetLocation,
  onLocateMe,
  isLocating = false,
}) => {
  const triggerGetLocation = onLocateMe || onGetLocation;
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<{ [id: string]: L.Marker }>({});
  const userMarkerRef = useRef<L.Marker | null>(null);
  const prevSelectedIdRef = useRef<string | null>(null);
  const hasCentredOnUserRef = useRef<boolean>(false);
  const hasFitBoundsRef = useRef<boolean>(false);

  // Active pandal selected in map for the Uber-style bottom card
  const [previewPandal, setPreviewPandal] = useState<Pandal | null>(selectedPandal);

  // Sync if selectedPandal changes from outside (Audited dependency behavior)
  useEffect(() => {
    if (selectedPandal) {
      setPreviewPandal(selectedPandal);
      if (mapRef.current) {
        mapRef.current.setView([selectedPandal.latitude, selectedPandal.longitude], 16, {
          animate: true,
        });
      }
    }
  }, [selectedPandal]);

  // Stable location lat/lng helper mapped to useMemo reference (Guideline 2)
  const mapInitialCenter = useMemo(() => {
    const defaultLat = userLocation?.latitude || (pandals.length > 0 ? pandals[0].latitude : DEFAULT_CENTER_LAT);
    const defaultLng = userLocation?.longitude || (pandals.length > 0 ? pandals[0].longitude : DEFAULT_CENTER_LNG);
    return { lat: defaultLat, lng: defaultLng };
  }, [userLocation, pandals]);

  // Initialize Map strictly once on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([mapInitialCenter.lat, mapInitialCenter.lng], userLocation ? 14 : 12);

    // Top-right compact zoom controls (positioned away from top floating bar)
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Fast, ultra-reliable CartoDB Voyager tiles with fallback to OSM (Guideline 2)
    L.tileLayer(MAP_TILES_URL, MAP_TILES_CONFIG).addTo(map);

    // Dismiss preview card when tapping on empty map
    map.on('click', () => {
      setPreviewPandal(null);
    });

    mapRef.current = map;

    // Invalidate size across intervals to guarantee zero blank-map issues
    const t1 = setTimeout(() => map.invalidateSize(), 50);
    const t2 = setTimeout(() => map.invalidateSize(), 200);
    const t3 = setTimeout(() => map.invalidateSize(), 500);

    // Debounced ResizeObserver to prevent continuous layout flicker
    let ro: ResizeObserver | null = null;
    let lastW = 0;
    let lastH = 0;
    let rafId: number | null = null;

    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (Math.abs(width - lastW) > 3 || Math.abs(height - lastH) > 3) {
            lastW = width;
            lastH = height;
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
              if (mapRef.current) {
                mapRef.current.invalidateSize({ animate: false });
              }
            });
          }
        }
      });
      ro.observe(mapContainerRef.current);
    }

    // Resume & auto-refresh map when laptop wakes up or user returns
    const handleResume = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize({ animate: false });
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleResume);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleResume);
      if (ro) ro.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Markers smoothly without removing/recreating un-changed pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentMarkerIds = new Set(Object.keys(markersRef.current));
    const newPandalIds = new Set(pandals.map((p) => p.id));
    const prevSelectedId = prevSelectedIdRef.current;
    const currentSelectedId = previewPandal?.id || null;

    // Remove markers that no longer exist
    currentMarkerIds.forEach((id) => {
      if (!newPandalIds.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });

    // Create or update markers in-place
    pandals.forEach((pandal) => {
      const isSelected = currentSelectedId === pandal.id;
      const wasSelected = prevSelectedId === pandal.id;

      const existingMarker = markersRef.current[pandal.id];

      // Helper to generate marker icon
      const createIcon = (selected: boolean) =>
        L.divIcon({
          className: 'custom-pandal-pin',
          html: `
            <div style="
              position: relative;
              transform: translate(-50%, -100%);
              display: flex;
              flex-direction: column;
              align-items: center;
              cursor: pointer;
              transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
              ${selected ? 'transform: translate(-50%, -115%) scale(1.22); z-index: 9999;' : ''}
            ">
              <div style="
                background: ${selected ? 'linear-gradient(135deg, #b45309, #d97706)' : 'linear-gradient(135deg, #d97706, #f59e0b)'};
                color: white;
                padding: ${selected ? '6px 10px' : '4px 8px'};
                border-radius: 20px;
                display: flex;
                align-items: center;
                gap: 4px;
                font-weight: 800;
                font-size: ${selected ? '12px' : '11px'};
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
                border: 2px solid #ffffff;
                white-space: nowrap;
              ">
                <span>🚩</span>
                <span>${pandal.name.split(' ')[0]}</span>
              </div>
              <div style="
                width: 0;
                height: 0;
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-top: 8px solid ${selected ? '#b45309' : '#d97706'};
                margin-top: -1px;
              "></div>
              <div style="
                width: 10px;
                height: 4px;
                background: rgba(0,0,0,0.3);
                border-radius: 50%;
                margin-top: 1px;
              "></div>
            </div>
          `,
          iconSize: [0, 0],
        });

      if (existingMarker) {
        // ONLY update icon if selection status changed for this specific marker
        if (isSelected !== wasSelected) {
          existingMarker.setIcon(createIcon(isSelected));
        }
        existingMarker.setLatLng([pandal.latitude, pandal.longitude]);
      } else {
        const marker = L.marker([pandal.latitude, pandal.longitude], { icon: createIcon(isSelected) }).addTo(map);

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setPreviewPandal(pandal);
          map.setView([pandal.latitude, pandal.longitude], 16, { animate: true });
        });

        markersRef.current[pandal.id] = marker;
      }
    });

    prevSelectedIdRef.current = currentSelectedId;

    // Auto-fit bounds ONLY once on initial marker load
    if (!previewPandal && pandals.length > 0 && !userLocation && !hasFitBoundsRef.current) {
      const group = L.featureGroup(Object.values(markersRef.current));
      if (group.getLayers().length > 0) {
        map.fitBounds(group.getBounds().pad(0.12), { maxZoom: 14 });
        hasFitBoundsRef.current = true;
      }
    }
  }, [pandals, previewPandal]);

  // User Location Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'uber-user-location',
        html: `
          <div style="
            position: relative;
            width: 22px;
            height: 22px;
            transform: translate(-50%, -50%);
          ">
            <div style="
              position: absolute;
              inset: -6px;
              background: rgba(37, 99, 235, 0.25);
              border-radius: 50%;
            "></div>
            <div style="
              width: 22px;
              height: 22px;
              background-color: #2563eb;
              border: 3px solid #ffffff;
              border-radius: 50%;
              box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            "></div>
          </div>
        `,
        iconSize: [0, 0],
      });

      const marker = L.marker([userLocation.latitude, userLocation.longitude], {
        icon: userIcon,
        zIndexOffset: 2000,
      }).addTo(map);

      userMarkerRef.current = marker;

      // Pan to user location ONLY on first detection to prevent loop snapping
      if (!hasCentredOnUserRef.current) {
        map.setView([userLocation.latitude, userLocation.longitude], 15, { animate: true });
        hasCentredOnUserRef.current = true;
      }
    }
  }, [userLocation]);

  // Recenter map on user location (Memoized Callback)
  const handleRecenter = useCallback(() => {
    if (triggerGetLocation) {
      triggerGetLocation();
    }
    if (userLocation && mapRef.current) {
      mapRef.current.setView([userLocation.latitude, userLocation.longitude], 16, { animate: true });
    }
  }, [triggerGetLocation, userLocation]);

  const handleDirectionsClick = useCallback((pandal: Pandal) => {
    if (onGetDirections) {
      onGetDirections(pandal);
    } else {
      const originParam = userLocation ? `&origin=${userLocation.latitude},${userLocation.longitude}` : '';
      const url = `https://www.google.com/maps/dir/?api=1&destination=${pandal.latitude},${pandal.longitude}${originParam}&travelmode=driving`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [onGetDirections, userLocation]);

  const handleCloseCard = useCallback(() => {
    setPreviewPandal(null);
  }, []);

  const handleCardClick = useCallback((pandal: Pandal) => {
    setPreviewPandal(pandal);
    if (mapRef.current) {
      mapRef.current.setView([pandal.latitude, pandal.longitude], 16, { animate: true });
    }
  }, []);

  return (
    <div className="relative w-full h-full bg-amber-50 overflow-hidden">
      {/* Full Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Floating "Your Location" Button (In-Map Uber Style) */}
      <div className="absolute right-3 sm:right-4 top-36 sm:top-40 z-[1000]">
        <button
          type="button"
          onClick={handleRecenter}
          disabled={isLocating}
          className="bg-white/95 backdrop-blur-md hover:bg-amber-50 active:scale-95 transition-all text-amber-950 font-bold text-xs px-3.5 py-2.5 rounded-2xl shadow-xl border border-amber-300 flex items-center gap-2 cursor-pointer group"
          title="Detect and center on your location"
        >
          <div className={`p-1 rounded-full transition-colors ${userLocation ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-800'}`}>
            <Navigation className={`w-4 h-4 ${isLocating ? 'animate-spin text-amber-600' : userLocation ? 'fill-blue-600' : ''}`} />
          </div>
          <span className="font-semibold text-xs text-gray-900 whitespace-nowrap">
            {isLocating ? 'Locating…' : 'Your Location'}
          </span>
          {userLocation && (
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
          )}
        </button>
      </div>

      {/* Floating GPS / Recenter Circle Button (Uber style) */}
      <div className="absolute right-4 bottom-28 sm:bottom-32 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          onClick={handleRecenter}
          disabled={isLocating}
          className="w-12 h-12 bg-white/95 backdrop-blur-md text-amber-900 rounded-full shadow-2xl border border-amber-300 flex items-center justify-center hover:bg-amber-50 active:scale-90 transition-transform cursor-pointer"
          title="Your Location"
        >
          <Navigation className={`w-5 h-5 ${isLocating ? 'animate-spin text-amber-600' : userLocation ? 'text-blue-600 fill-blue-600' : 'text-amber-800'}`} />
        </button>
      </div>

      {/* Standalone Subcomponents rendered out of the tree (Guideline 1 & 5) */}
      {previewPandal ? (
        <PandalPreviewCard
          pandal={previewPandal}
          distances={distances}
          onClose={handleCloseCard}
          onViewDetails={onSelectPandal}
          onGetDirections={handleDirectionsClick}
        />
      ) : (
        <NearbyPandalsCarousel
          pandals={pandals}
          distances={distances}
          onCardClick={handleCardClick}
        />
      )}
    </div>
  );
});
