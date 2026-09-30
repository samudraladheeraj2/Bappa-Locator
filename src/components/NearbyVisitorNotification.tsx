import React, { useState, useEffect } from 'react';
import { Camera, MapPin, Sparkles, X, ChevronRight } from 'lucide-react';
import { Pandal } from '../types';
import { getCoordinatesDistanceMeters } from '../utils/duplicateDetector';
import { getCoverPhotoMetadata, CURRENT_FESTIVAL_YEAR } from '../utils/yearlyPhotos';
import { formatDistance } from '../utils/geo';
import { UpdateIdolModal } from './UpdateIdolModal';

interface NearbyVisitorNotificationProps {
  userLocation: { latitude: number; longitude: number } | null;
  pandals: Pandal[];
  onPandalUpdated?: (updatedPandal: Pandal) => void;
}

export const NearbyVisitorNotification: React.FC<NearbyVisitorNotificationProps> = ({
  userLocation,
  pandals,
  onPandalUpdated,
}) => {
  const currentYear = CURRENT_FESTIVAL_YEAR; // 2026
  const [dismissedPandalIds, setDismissedPandalIds] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('bappa_dismissed_nearby_notifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [nearbyTarget, setNearbyTarget] = useState<{
    pandal: Pandal;
    distanceMeters: number;
  } | null>(null);

  const [pandalForPhotoModal, setPandalForPhotoModal] = useState<Pandal | null>(null);

  // Detect if user is within 150m of any pandal that lacks a 2026 verified photo
  useEffect(() => {
    if (!userLocation || !pandals || pandals.length === 0) {
      setNearbyTarget(null);
      return;
    }

    const { latitude: userLat, longitude: userLng } = userLocation;
    let closestCandidate: { pandal: Pandal; distanceMeters: number } | null = null;

    for (const pandal of pandals) {
      if (!pandal.latitude || !pandal.longitude) continue;
      if (dismissedPandalIds.includes(pandal.id)) continue;

      const coverMeta = getCoverPhotoMetadata(pandal, currentYear);
      // Only notify if 2026 photo is missing / awaiting update!
      if (coverMeta.isCurrentYear) continue;

      const dist = getCoordinatesDistanceMeters(userLat, userLng, pandal.latitude, pandal.longitude);
      if (dist <= 150) {
        if (!closestCandidate || dist < closestCandidate.distanceMeters) {
          closestCandidate = { pandal, distanceMeters: Math.round(dist) };
        }
      }
    }

    setNearbyTarget(closestCandidate);
  }, [userLocation, pandals, dismissedPandalIds, currentYear]);

  const handleDismiss = (pandalId: string) => {
    const updated = [...dismissedPandalIds, pandalId];
    setDismissedPandalIds(updated);
    try {
      sessionStorage.setItem('bappa_dismissed_nearby_notifications', JSON.stringify(updated));
    } catch (e) {}
    setNearbyTarget(null);
  };

  if (!nearbyTarget) return null;

  const { pandal, distanceMeters } = nearbyTarget;

  return (
    <>
      <div className="fixed top-16 sm:top-20 inset-x-3 sm:inset-x-auto sm:right-6 z-[1020] max-w-md mx-auto animate-in slide-in-from-top duration-300">
        <div className="bg-amber-950 text-white rounded-2xl p-3.5 shadow-2xl border-2 border-yellow-400 flex items-start gap-3 relative">
          <button
            type="button"
            onClick={() => handleDismiss(pandal.id)}
            className="absolute top-2 right-2 p-1 text-amber-300 hover:text-white rounded-full hover:bg-amber-900 transition-colors cursor-pointer"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-2 bg-gradient-to-tr from-amber-600 to-yellow-400 text-amber-950 rounded-xl shrink-0 mt-0.5 shadow-md">
            <Camera className="w-5 h-5" />
          </div>

          <div className="space-y-1 pr-6 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="bg-yellow-400 text-amber-950 text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-2xs">
                🚩 Nearby Visitor Alert
              </span>
              <span className="text-[10px] text-amber-200 font-bold">
                {formatDistance(distanceMeters / 1000)} away
              </span>
            </div>

            <h4 className="font-extrabold text-xs sm:text-sm text-yellow-100 truncate leading-snug">
              You are near "{pandal.name}"!
            </h4>

            <p className="text-[11px] text-amber-200/90 leading-tight">
              Help devotees by uploading the <strong>{currentYear} Lord Ganesha idol photo</strong> for this mandapam.
            </p>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPandalForPhotoModal(pandal)}
                className="px-3.5 py-1.5 bg-gradient-to-r from-yellow-400 to-amber-400 hover:from-yellow-300 hover:to-amber-300 text-amber-950 font-extrabold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Upload {currentYear} Idol Photo</span>
              </button>
              <button
                type="button"
                onClick={() => handleDismiss(pandal.id)}
                className="text-[11px] text-amber-300 hover:text-white underline font-semibold px-1"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Update Idol Modal */}
      {pandalForPhotoModal && (
        <UpdateIdolModal
          isOpen={!!pandalForPhotoModal}
          onClose={() => setPandalForPhotoModal(null)}
          pandal={pandalForPhotoModal}
          onSuccess={(updated) => {
            if (onPandalUpdated) {
              onPandalUpdated(updated);
            }
            handleDismiss(pandalForPhotoModal.id);
            setPandalForPhotoModal(null);
          }}
        />
      )}
    </>
  );
};
