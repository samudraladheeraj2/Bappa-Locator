import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  Search,
  Link as LinkIcon,
  Loader2,
  AlertCircle,
  Check,
  X,
  AlertTriangle,
  Camera,
  CheckCircle2,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Pandal } from '../types';
import { getCoordinatesDistanceMeters } from '../utils/duplicateDetector';
import { PANDALS_DATA } from '../data/pandals';

interface LocationPickerProps {
  latitude: number;
  longitude: number;
  address: string;
  onLocationChange: (lat: number, lng: number, address: string, area?: string, city?: string) => void;
  existingPandals?: Pandal[];
  onAddPhotoToExistingPandal?: (pandal: Pandal) => void;
}

interface SearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address?: {
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    state?: string;
  };
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  latitude,
  longitude,
  address,
  onLocationChange,
  existingPandals = PANDALS_DATA,
  onAddPhotoToExistingPandal,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // States
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [manualLat, setManualLat] = useState(latitude ? latitude.toFixed(6) : '17.385000');
  const [manualLng, setManualLng] = useState(longitude ? longitude.toFixed(6) : '78.486700');

  // Location & Search state
  const [locationInput, setLocationInput] = useState<string>(() => {
    if (address) {
      return `${address}${latitude && longitude ? ` (${latitude.toFixed(6)}, ${longitude.toFixed(6)})` : ''}`;
    }
    return '';
  });
  const isUserTypingRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Nearby 10m-20m Duplicate Detection state
  const [dismissedDuplicateKey, setDismissedDuplicateKey] = useState<string | null>(null);
  const [nearbyDuplicate, setNearbyDuplicate] = useState<{
    pandal: Pandal;
    distanceMeters: number;
  } | null>(null);

  // Sync external address & coordinates if updated from props/draft
  useEffect(() => {
    if (address && !isUserTypingRef.current) {
      const coordStr = latitude && longitude ? ` (${latitude.toFixed(6)}, ${longitude.toFixed(6)})` : '';
      setLocationInput(`${address}${coordStr}`);
      if (latitude) setManualLat(latitude.toFixed(6));
      if (longitude) setManualLng(longitude.toFixed(6));
    }
  }, [address, latitude, longitude]);

  // Check for nearby duplicates within 20 meters
  useEffect(() => {
    const lat = parseFloat(manualLat) || latitude;
    const lng = parseFloat(manualLng) || longitude;
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      setNearbyDuplicate(null);
      return;
    }

    const currentKey = `${lat.toFixed(5)}_${lng.toFixed(5)}`;
    if (dismissedDuplicateKey === currentKey) {
      return;
    }

    let closest: { pandal: Pandal; distanceMeters: number } | null = null;
    for (const p of existingPandals) {
      if (!p.latitude || !p.longitude) continue;
      const d = getCoordinatesDistanceMeters(lat, lng, p.latitude, p.longitude);
      if (d <= 20) {
        if (!closest || d < closest.distanceMeters) {
          closest = { pandal: p, distanceMeters: Math.round(d) };
        }
      }
    }

    setNearbyDuplicate(closest);
  }, [manualLat, manualLng, latitude, longitude, existingPandals, dismissedDuplicateKey]);

  // Google Maps link parser state
  const [linkInput, setLinkInput] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);

  // Gesture handling state for touch devices / scrolling
  const [showGestureHint, setShowGestureHint] = useState(false);
  const gestureHintTimer = useRef<NodeJS.Timeout | null>(null);

  // Debounced reverse geocoding
  const reverseGeocodeTimer = useRef<NodeJS.Timeout | null>(null);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setLoading(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            headers: {
              'Accept-Language': 'en',
            },
          }
        );
        if (!response.ok) throw new Error('Geocoding request failed');
        const data = await response.json();

        const newAddress = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        const area = data.address?.suburb || data.address?.neighbourhood || data.address?.residential || 'Hyderabad Central';
        const city = data.address?.city || data.address?.town || 'Hyderabad';

        onLocationChange(lat, lng, newAddress, area, city);
        setManualLat(lat.toFixed(6));
        setManualLng(lng.toFixed(6));
        if (!isUserTypingRef.current) {
          setLocationInput(`${newAddress} (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
        }
      } catch (e) {
        const fallbackAddr = address || `GPS Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
        onLocationChange(lat, lng, fallbackAddr);
        setManualLat(lat.toFixed(6));
        setManualLng(lng.toFixed(6));
        if (!isUserTypingRef.current) {
          setLocationInput(`${fallbackAddr} (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
        }
      } finally {
        setLoading(false);
      }
    },
    [address, onLocationChange]
  );

  // Initialize Map (scrollWheelZoom={false} allows smooth page/modal scrolling)
  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      const initialLat = latitude || 17.385;
      const initialLng = longitude || 78.4867;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false, // Prevents mouse wheel zooming from trapping page/modal scroll
        touchZoom: true,
      }).setView([initialLat, initialLng], 16);

      L.control.zoom({ position: 'topright' }).addTo(map);

      // OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      // Touch & Gesture shielding: Allows single-finger modal scrolling without getting trapped
      const containerEl = containerRef.current;
      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 1) {
          map.dragging.disable();
        } else if (e.touches.length >= 2) {
          map.dragging.enable();
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 1) {
          setShowGestureHint(true);
          if (gestureHintTimer.current) clearTimeout(gestureHintTimer.current);
          gestureHintTimer.current = setTimeout(() => {
            setShowGestureHint(false);
          }, 1800);
        }
      };

      const handleTouchEnd = () => {
        map.dragging.enable();
      };

      const handleMouseDown = () => {
        map.dragging.enable();
      };

      containerEl.addEventListener('touchstart', handleTouchStart, { passive: true });
      containerEl.addEventListener('touchmove', handleTouchMove, { passive: true });
      containerEl.addEventListener('touchend', handleTouchEnd, { passive: true });
      containerEl.addEventListener('mousedown', handleMouseDown);

      map.on('movestart', () => {
        setIsDragging(true);
      });

      map.on('moveend', () => {
        setIsDragging(false);
        const center = map.getCenter();
        setManualLat(center.lat.toFixed(6));
        setManualLng(center.lng.toFixed(6));

        if (reverseGeocodeTimer.current) {
          clearTimeout(reverseGeocodeTimer.current);
        }
        reverseGeocodeTimer.current = setTimeout(() => {
          reverseGeocode(center.lat, center.lng);
        }, 350);
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        map.panTo(e.latlng, { animate: true });
      });

      mapRef.current = map;

      const timer1 = setTimeout(() => map.invalidateSize(), 50);
      const timer2 = setTimeout(() => map.invalidateSize(), 250);
      const timer3 = setTimeout(() => map.invalidateSize(), 600);

      let resizeObserver: ResizeObserver | null = null;
      let lastW = 0;
      let lastH = 0;
      let rafId: number | null = null;

      if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
        resizeObserver = new ResizeObserver((entries) => {
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
        resizeObserver.observe(containerRef.current);
      }

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        if (rafId) cancelAnimationFrame(rafId);
        if (gestureHintTimer.current) clearTimeout(gestureHintTimer.current);
        if (reverseGeocodeTimer.current) clearTimeout(reverseGeocodeTimer.current);
        containerEl.removeEventListener('touchstart', handleTouchStart);
        containerEl.removeEventListener('touchmove', handleTouchMove);
        containerEl.removeEventListener('touchend', handleTouchEnd);
        containerEl.removeEventListener('mousedown', handleMouseDown);
        if (resizeObserver) resizeObserver.disconnect();
        map.remove();
        mapRef.current = null;
      };
    }
  }, []);

  // Update map view if coordinates change externally
  useEffect(() => {
    if (mapRef.current && latitude && longitude) {
      const current = mapRef.current.getCenter();
      const dist = Math.abs(current.lat - latitude) + Math.abs(current.lng - longitude);
      if (dist > 0.0005) {
        mapRef.current.setView([latitude, longitude], 16);
      }
    }
  }, [latitude, longitude]);

  // Handle Search input
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const q = encodeURIComponent(searchQuery);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${q}&countrycodes=in&limit=5&addressdetails=1`
        );
        const data = await res.json();
        setSearchResults(data || []);
        setShowSearchResults(true);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectSearchResult = (result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (!isNaN(lat) && !isNaN(lng)) {
      if (mapRef.current) {
        mapRef.current.setView([lat, lng], 17, { animate: true });
      }
      const area = result.address?.suburb || result.address?.neighbourhood || 'Hyderabad';
      const city = result.address?.city || 'Hyderabad';
      isUserTypingRef.current = false;
      onLocationChange(lat, lng, result.display_name, area, city);
      setManualLat(lat.toFixed(6));
      setManualLng(lng.toFixed(6));
      setLocationInput(`${result.display_name} (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
      setShowSearchResults(false);
      setSearchQuery('');
    }
  };

  // Handle "My location"
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setLoading(true);
    isUserTypingRef.current = false;
    setLocationInput('Fetching GPS Location & Coordinates…');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (mapRef.current) {
          mapRef.current.setView([lat, lng], 17, { animate: true });
        }
        setManualLat(lat.toFixed(6));
        setManualLng(lng.toFixed(6));

        const immediateLoc = address || `GPS Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
        setLocationInput(`${immediateLoc} (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
        onLocationChange(lat, lng, immediateLoc);
        reverseGeocode(lat, lng);
      },
      () => {
        setLoading(false);
        setLocationInput(address ? `${address} (${latitude.toFixed(6)}, ${longitude.toFixed(6)})` : '');
        alert('Could not retrieve your location. Please check browser permissions.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const validateAndApplyCoords = (lat: number, lng: number): boolean => {
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setLinkError('Coordinates out of range. Latitude must be between -90 and 90, Longitude between -180 and 180.');
      return false;
    }

    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 17, { animate: true });
    }
    setManualLat(lat.toFixed(6));
    setManualLng(lng.toFixed(6));
    isUserTypingRef.current = false;
    const immediateLoc = address || `Location (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    setLocationInput(`${immediateLoc} (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
    reverseGeocode(lat, lng);
    setLinkError(null);
    return true;
  };

  const handleUseLink = () => {
    setLinkError(null);
    setLinkSuccess(false);

    if (!linkInput.trim()) {
      setLinkError('Please enter a Google Maps link or coordinates.');
      return;
    }

    const trimmed = linkInput.trim();
    const directCoordsMatch = trimmed.match(/^([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)$/);
    if (directCoordsMatch) {
      const lat = parseFloat(directCoordsMatch[1]);
      const lng = parseFloat(directCoordsMatch[2]);
      if (validateAndApplyCoords(lat, lng)) {
        setLinkSuccess(true);
        return;
      }
    }

    const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lng = parseFloat(atMatch[2]);
      if (validateAndApplyCoords(lat, lng)) {
        setLinkSuccess(true);
        return;
      }
    }

    const queryMatch = trimmed.match(/(?:[?&](?:q|query|ll|daddr)=)(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (queryMatch) {
      const lat = parseFloat(queryMatch[1]);
      const lng = parseFloat(queryMatch[2]);
      if (validateAndApplyCoords(lat, lng)) {
        setLinkSuccess(true);
        return;
      }
    }

    const pathMatch = trimmed.match(/(?:place|search)\/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (pathMatch) {
      const lat = parseFloat(pathMatch[1]);
      const lng = parseFloat(pathMatch[2]);
      if (validateAndApplyCoords(lat, lng)) {
        setLinkSuccess(true);
        return;
      }
    }

    setLinkError('Could not find valid coordinates in this link. Enter "latitude, longitude" (e.g. 17.4399, 78.4983).');
  };

  const handleManualCoordSubmit = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      validateAndApplyCoords(lat, lng);
      isUserTypingRef.current = false;
      setLocationInput(`${address || 'Custom Coordinates'} (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
    }
  };

  const handleDismissDuplicate = () => {
    const lat = parseFloat(manualLat) || latitude;
    const lng = parseFloat(manualLng) || longitude;
    setDismissedDuplicateKey(`${lat.toFixed(5)}_${lng.toFixed(5)}`);
    setNearbyDuplicate(null);
  };

  return (
    <div className="space-y-4 bg-amber-50/40 p-4 rounded-2xl border border-amber-200/80">
      {/* Search and My Location Row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-amber-700" />
            Location (Address & Coordinates) *
          </label>
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={loading}
            className="text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
            title="Fetch your current GPS location and coordinates"
          >
            <Navigation className={`w-3.5 h-3.5 text-amber-700 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Locating…' : 'Your Location'}</span>
          </button>
        </div>

        {/* Address / Landmark Search & Auto-Filled Location */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-amber-600 shrink-0" />
            <input
              type="text"
              value={locationInput}
              onChange={(e) => {
                isUserTypingRef.current = true;
                const val = e.target.value;
                setLocationInput(val);
                setSearchQuery(val);
                onLocationChange(parseFloat(manualLat) || latitude, parseFloat(manualLng) || longitude, val);
              }}
              placeholder="Tap 'Your Location' or search address/landmark…"
              className="w-full pl-9 pr-8 py-2.5 text-xs sm:text-sm bg-white border-2 border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs font-medium text-gray-900"
              required
            />
            {loading || isSearching ? (
              <Loader2 className="absolute right-3 w-4 h-4 text-amber-600 animate-spin" />
            ) : locationInput ? (
              <button
                type="button"
                onClick={() => {
                  isUserTypingRef.current = false;
                  setLocationInput('');
                  setSearchQuery('');
                  setSearchResults([]);
                  setShowSearchResults(false);
                  onLocationChange(parseFloat(manualLat) || latitude, parseFloat(manualLng) || longitude, '');
                }}
                className="absolute right-3 text-gray-400 hover:text-gray-600 p-0.5 rounded cursor-pointer"
                title="Clear location"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          {/* Search Results Dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-amber-200 rounded-xl shadow-xl z-[2000] max-h-60 overflow-y-auto divide-y divide-gray-100">
              {searchResults.map((item) => (
                <button
                  type="button"
                  key={item.place_id}
                  onClick={() => handleSelectSearchResult(item)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-amber-50/80 transition-colors flex items-start gap-2.5 text-xs text-gray-800 cursor-pointer"
                >
                  <MapPin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium">{item.display_name}</p>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {parseFloat(item.lat).toFixed(6)}, {parseFloat(item.lon).toFixed(6)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Auto-Filled Coordinates */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <div className="bg-white/90 border border-amber-300 rounded-xl p-2.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-700 mb-1">
              <span className="flex items-center gap-1">
                <span className="text-amber-700">📍</span>
                <span>Latitude Column</span>
              </span>
              <span className="text-[9px] font-extrabold uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                Auto-filled
              </span>
            </div>
            <input
              type="text"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              onBlur={handleManualCoordSubmit}
              placeholder="17.xxxxxx"
              className="w-full font-mono text-xs font-bold text-amber-950 bg-amber-50/50 border border-amber-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="bg-white/90 border border-amber-300 rounded-xl p-2.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-700 mb-1">
              <span className="flex items-center gap-1">
                <span className="text-amber-700">📍</span>
                <span>Longitude Column</span>
              </span>
              <span className="text-[9px] font-extrabold uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                Auto-filled
              </span>
            </div>
            <input
              type="text"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              onBlur={handleManualCoordSubmit}
              placeholder="78.xxxxxx"
              className="w-full font-mono text-xs font-bold text-amber-950 bg-amber-50/50 border border-amber-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Google Maps Link parser */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
          <LinkIcon className="w-3.5 h-3.5 text-amber-700" />
          <span>or paste a Google Maps link</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={linkInput}
            onChange={(e) => {
              setLinkInput(e.target.value);
              setLinkError(null);
              setLinkSuccess(false);
            }}
            placeholder="Paste a Google Maps link or “lat, lng”…"
            className="flex-1 px-3 py-2 text-xs bg-white border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
          />
          <button
            type="button"
            onClick={handleUseLink}
            className="px-3 py-2 text-xs font-bold text-white bg-amber-800 hover:bg-amber-700 active:scale-95 rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
          >
            Use link
          </button>
        </div>
        {linkError && (
          <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {linkError}
          </p>
        )}
        {linkSuccess && (
          <p className="text-xs text-emerald-700 flex items-center gap-1 mt-1">
            <Check className="w-3.5 h-3.5 shrink-0" />
            Coordinates detected and map centered!
          </p>
        )}
      </div>

      {/* Smart 10m–20m Nearby Duplicate Detection Warning Popup / Banner */}
      {nearbyDuplicate && (
        <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-400 shadow-sm animate-in fade-in zoom-in duration-200 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5 text-amber-700" />
            </div>
            <div className="space-y-1">
              <span className="bg-amber-600 text-white text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                Duplicate Warning (~{nearbyDuplicate.distanceMeters}m away)
              </span>
              <h4 className="font-extrabold text-sm text-gray-900 leading-snug">
                We found a pandal {nearbyDuplicate.distanceMeters}m away: "{nearbyDuplicate.pandal.name}". Is this the same pandal?
              </h4>
              <p className="text-xs text-gray-600">
                {nearbyDuplicate.pandal.address}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            {onAddPhotoToExistingPandal && (
              <button
                type="button"
                onClick={() => onAddPhotoToExistingPandal(nearbyDuplicate.pandal)}
                className="flex-1 px-3 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Add Photo to Existing Pandal</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleDismissDuplicate}
              className="flex-1 px-3 py-2 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 text-xs font-bold rounded-xl shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Confirm it is a distinct new entry</span>
            </button>
          </div>
        </div>
      )}

      {/* Interactive Map (Uber Style with Center Pin) */}
      <div className="space-y-1.5">
        <div className="relative w-full h-72 rounded-2xl border-2 border-amber-300/80 overflow-hidden shadow-md bg-amber-100">
          <div ref={containerRef} className="w-full h-full z-10" />

          {/* Uber-Style Fixed Center Pin Overlay */}
          <div className="absolute inset-0 pointer-events-none z-[1000] flex items-center justify-center">
            <div className="relative flex flex-col items-center">
              <div
                className={`transition-all duration-200 transform -translate-y-full ${
                  isDragging
                    ? '-translate-y-[135%] scale-110 drop-shadow-2xl'
                    : '-translate-y-full scale-100 drop-shadow-md'
                }`}
              >
                <div className="bg-amber-600 text-white p-2 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                  <span className="text-base select-none">🚩</span>
                </div>
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-amber-600 mx-auto -mt-[1px]" />
              </div>
              <div
                className={`w-3.5 h-1.5 bg-black/35 rounded-full blur-[1px] transition-all duration-200 ${
                  isDragging ? 'scale-75 opacity-40' : 'scale-100 opacity-80'
                }`}
              />
            </div>
          </div>

          {loading && (
            <div className="absolute top-3 left-3 z-[1100] bg-white/90 backdrop-blur-xs text-amber-900 px-3 py-1 rounded-full text-xs font-semibold shadow-md flex items-center gap-1.5 border border-amber-200">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
              <span>Updating address…</span>
            </div>
          )}

          {showGestureHint && (
            <div className="absolute inset-0 z-[1200] bg-black/40 backdrop-blur-[2px] flex items-center justify-center pointer-events-none transition-opacity duration-300">
              <div className="bg-amber-950/90 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 border border-amber-400/50 animate-in fade-in zoom-in duration-200">
                <span className="text-lg">✌️</span>
                <span>Use two fingers to move or zoom the map</span>
              </div>
            </div>
          )}

          <div className="absolute bottom-3 right-3 z-[1100]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleUseMyLocation();
              }}
              disabled={loading}
              className="bg-white/95 backdrop-blur-md hover:bg-amber-50 active:scale-95 text-amber-950 font-bold text-xs px-3 py-2 rounded-xl shadow-lg border border-amber-300 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Center map on your current GPS location"
            >
              <Navigation className={`w-3.5 h-3.5 text-blue-600 ${loading ? 'animate-spin' : 'fill-blue-600'}`} />
              <span>{loading ? 'Locating…' : 'Your Location'}</span>
            </button>
          </div>
        </div>

        <p className="text-[11px] text-amber-900/80 font-medium px-1 flex items-center justify-between">
          <span>👆 Tap map, drag, search, or paste link to set exact pin</span>
          <span className="hidden sm:inline text-amber-700/70">Mouse wheel scrolls page</span>
        </p>
      </div>
    </div>
  );
};
