import React, { useState, useEffect } from 'react';
import { Camera, MapPin, X, Sparkles, BellRing } from 'lucide-react';
import { Pandal } from '../types';
import { calculateDistance, formatDistance } from '../utils/geo';
import { CURRENT_FESTIVAL_YEAR } from '../utils/yearlyPhotos';
import { UpdateIdolModal } from './UpdateIdolModal';

interface VisitorPandalNotificationProps {
  userLocation: { latitude: number; longitude: number } | null;
  pandals: Pandal[];
  onPandalUpdated: (updatedPandal: Pandal) => void;
}

export const VisitorPandalNotification: React.FC<VisitorPandalNotificationProps> = ({
  userLocation,
  pandals,
  onPandalUpdated,
}) => {
  const [nearbyPandal, setNearbyPandal] = useState<{ pandal: Pandal; distanceMeters: number } | null>(null);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('bappa_dismissed_visitor_notifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedPandalForUpload, setSelectedPandalForUpload] = useState<Pandal | null>(null);

  useEffect(() => {
    if (!userLocation || !pandals || pandals.length === 0) {
      setNearbyPandal(null);
      return;
    }

    // Find pandals within 50 meters that DO NOT have an approved current year photo yet
    const candidates = pandals
      .filter((p) => {
        if (dismissedIds.includes(p.id)) return false;

        const yearlyPhotos = p.yearlyPhotos || [];
        const hasApprovedCurrentYear = yearlyPhotos.some(
          (photo) => photo.year === CURRENT_FESTIVAL_YEAR && (!photo.status || photo.status === 'approved')
        );

        // Notify if current year photo is missing or pending
        return !hasApprovedCurrentYear;
      })
      .map((p) => {
        const distKm = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          p.latitude,
          p.longitude
        );
        return { pandal: p, distanceMeters: Math.round(distKm * 1000) };
      })
      .filter((item) => item.distanceMeters <= 50); // within 50m radius

    // Sort by proximity
    candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);

    if (candidates.length > 0) {
      const top = candidates[0];
      setNearbyPandal((prev) => {
        if (prev && prev.pandal.id === top.pandal.id && prev.distanceMeters === top.distanceMeters) {
          return prev;
        }
        return top;
      });
    } else {
      setNearbyPandal(null);
    }
  }, [userLocation, pandals, dismissedIds]);

  const handleDismiss = () => {
    if (nearbyPandal) {
      const updated = [...dismissedIds, nearbyPandal.pandal.id];
      setDismissedIds(updated);
      try {
        sessionStorage.setItem('bappa_dismissed_visitor_notifications', JSON.stringify(updated));
      } catch (e) {}
    }
  };

  if (!nearbyPandal) return null;

  const { pandal, distanceMeters } = nearbyPandal;

  return (
    <>
      <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 z-40 max-w-md animate-in slide-in-from-bottom-5 duration-300">
        <div className="bg-gradient-to-r from-amber-900 via-amber-800 to-amber-950 text-white rounded-2xl p-4 shadow-2xl border-2 border-amber-400/80 relative overflow-hidden backdrop-blur-md">
          {/* Subtle glowing background aura */}
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-400/20 rounded-full blur-xl pointer-events-none" />

          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 text-amber-200/80 hover:text-white p-1 rounded-full hover:bg-amber-800/50 transition"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3">
            <div className="bg-amber-500/20 text-amber-300 p-2.5 rounded-xl shrink-0 border border-amber-400/30 animate-bounce">
              <BellRing className="w-6 h-6 text-amber-300" />
            </div>

            <div className="flex-1 pr-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase tracking-wider mb-0.5">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>You are visiting this Pandal ({formatDistance(distanceMeters / 1000)})</span>
              </div>

              <h4 className="font-bold text-base text-white line-clamp-1">{pandal.name}</h4>
              <p className="text-xs text-amber-100/90 mt-1 leading-snug">
                The <strong>{CURRENT_FESTIVAL_YEAR} Lord Ganesha idol photo</strong> is not updated yet. Help devotees by sharing a photo!
              </p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setSelectedPandalForUpload(pandal)}
                  className="flex-1 bg-gradient-to-r from-amber-400 to-yellow-500 text-amber-950 font-extrabold text-xs px-3.5 py-2 rounded-xl shadow-lg hover:from-amber-300 hover:to-yellow-400 active:scale-95 transition flex items-center justify-center gap-1.5"
                >
                  <Camera className="w-4 h-4 text-amber-950" />
                  <span>Update {CURRENT_FESTIVAL_YEAR} Idol Photo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedPandalForUpload && (
        <UpdateIdolModal
          isOpen={!!selectedPandalForUpload}
          pandal={selectedPandalForUpload}
          onClose={() => setSelectedPandalForUpload(null)}
          onSuccess={(updatedPandal) => {
            onPandalUpdated(updatedPandal);
            setSelectedPandalForUpload(null);
            handleDismiss();
          }}
        />
      )}
    </>
  );
};
