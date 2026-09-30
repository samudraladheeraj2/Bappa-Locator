import React, { useState, useEffect, useMemo } from 'react';
import { Utensils, Calendar, Clock, MapPin, Phone, Sparkles, Navigation, Compass } from 'lucide-react';
import { Annadanam } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { isAnnadanamExpired, cleanupExpiredAnnadanam } from '../utils/annadanamExpiry';
import { ANNADANAM_DATA } from '../data/annadanam';
import { calculateDistance, formatDistance } from '../utils/geo';

interface AnnadanamViewProps {
  onOpenSuggestAnnadanam: () => void;
  userLocation?: { latitude: number; longitude: number } | null;
  onGetLocation?: () => void;
  isLocating?: boolean;
}

export const AnnadanamView: React.FC<AnnadanamViewProps> = ({
  onOpenSuggestAnnadanam,
  userLocation,
  onGetLocation,
  isLocating,
}) => {
  const [annadanamList, setAnnadanamList] = useState<Annadanam[]>(() => {
    try {
      const cached = localStorage.getItem('bappa_annadanam_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return ANNADANAM_DATA.filter((item) => !isAnnadanamExpired(item.date, item.createdAt));
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      if (annadanamList && annadanamList.length > 0) {
        localStorage.setItem('bappa_annadanam_cache', JSON.stringify(annadanamList));
      }
    } catch (e) {}
  }, [annadanamList]);

  useEffect(() => {
    const q = query(collection(db, 'annadanam'), where('status', '==', 'approved'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rawItems = snapshot.docs.map((doc) => {
          const data = doc.data();
          const photos = data.photos || (data.image ? [data.image] : []);
          return {
            id: data.id || doc.id,
            pandalName: data.pandalName,
            date: data.date,
            startTime: data.startTime,
            endTime: data.endTime,
            address: data.address,
            area: data.area,
            city: data.city || 'Hyderabad',
            description: data.description,
            contactInfo: data.contactInfo,
            photos,
            image: data.image || (photos[0] || ''),
            latitude: data.latitude,
            longitude: data.longitude,
            status: data.status,
            submittedBy: data.submittedBy,
            submittedByEmail: data.submittedByEmail,
            createdAt: data.createdAt,
          };
        });

        // Trigger background cleanup of expired records from database
        cleanupExpiredAnnadanam(rawItems).catch(() => {});

        // Keep active items: valid on event date (today) and next day (tomorrow)
        const activeFirestoreItems = rawItems.filter(
          (item) => !isAnnadanamExpired(item.date, item.createdAt)
        );

        // Merge with non-expired static demo entries if applicable
        const activeStaticItems = ANNADANAM_DATA.filter(
          (item) => !isAnnadanamExpired(item.date, item.createdAt)
        );

        const seenIds = new Set(activeFirestoreItems.map((it) => it.id));
        const combined = [
          ...activeFirestoreItems,
          ...activeStaticItems.filter((it) => !seenIds.has(it.id)),
        ];

        setAnnadanamList((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(combined)) {
            return prev;
          }
          return combined;
        });
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching annadanam:', error);
        // Fallback to active static items on error
        const activeStaticItems = ANNADANAM_DATA.filter(
          (item) => !isAnnadanamExpired(item.date, item.createdAt)
        );
        setAnnadanamList(activeStaticItems);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute distances and sort by proximity if userLocation is available
  const sortedList = useMemo(() => {
    if (!userLocation) return annadanamList;

    return [...annadanamList].sort((a, b) => {
      const distA =
        a.latitude && a.longitude
          ? calculateDistance(userLocation.latitude, userLocation.longitude, a.latitude, a.longitude)
          : Infinity;
      const distB =
        b.latitude && b.longitude
          ? calculateDistance(userLocation.latitude, userLocation.longitude, b.latitude, b.longitude)
          : Infinity;
      return distA - distB;
    });
  }, [annadanamList, userLocation]);

  const handleGetDirections = (item: Annadanam) => {
    if (!item.latitude || !item.longitude) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${item.pandalName}, ${item.area}, Hyderabad`
      )}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    const originParam = userLocation
      ? `&origin=${userLocation.latitude},${userLocation.longitude}`
      : '';
    const url = `https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}${originParam}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4 pb-24">
      {/* Banner */}
      <div className="bg-gradient-to-r from-amber-800 to-amber-950 text-white p-6 rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-yellow-300 mb-1">
            <Utensils className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Free Maha Prasadam</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold">Annadanam Schedules in Hyderabad</h2>
          <p className="text-xs text-amber-200 mt-1 max-w-md">
            Find verified community food distribution and Maha Prasadam timings across Ganesh pandals during Ganeshotsav.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {onGetLocation && (
            <button
              onClick={onGetLocation}
              disabled={isLocating}
              className={`flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 ${
                userLocation
                  ? 'bg-amber-700 text-yellow-300 border border-amber-500'
                  : 'bg-amber-900 text-amber-100 hover:bg-amber-800 border border-amber-700'
              }`}
            >
              <Navigation className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
              <span>{isLocating ? 'Locating...' : userLocation ? 'Near Me (Active)' : 'Annadanam near me'}</span>
            </button>
          )}
          <button
            onClick={onOpenSuggestAnnadanam}
            className="flex-1 sm:flex-initial bg-yellow-500 hover:bg-yellow-400 text-amber-950 px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all shrink-0 whitespace-nowrap"
          >
            + Suggest Annadanam
          </button>
        </div>
      </div>

      {userLocation && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-emerald-600 animate-pulse" />
            <span>Sorted by nearest to your current location</span>
          </div>
          <span className="text-[10px] bg-emerald-200/80 text-emerald-950 px-2 py-0.5 rounded-full font-bold">
            {sortedList.length} Schedules
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading Annadanam schedules...</div>
      ) : sortedList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-2xl border border-amber-100 shadow-xs">
          <div className="bg-amber-100 p-4 rounded-full text-amber-800 mb-3">
            <Utensils className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">No Annadanam Schedules Live Yet</h3>
          <p className="text-sm text-gray-500 max-w-sm mb-4">
            Be the first to suggest or contribute Annadanam details for devotees in Hyderabad!
          </p>
          <button
            onClick={onOpenSuggestAnnadanam}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-md"
          >
            Suggest Annadanam
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sortedList.map((item) => {
            const distance =
              userLocation && item.latitude && item.longitude
                ? calculateDistance(
                    userLocation.latitude,
                    userLocation.longitude,
                    item.latitude,
                    item.longitude
                  )
                : undefined;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl overflow-hidden border border-amber-100 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                {item.image && (
                  <div className="w-full h-44 overflow-hidden bg-amber-50 relative">
                    <img
                      src={item.image}
                      alt={item.pandalName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Maha Prasadam
                    </div>
                    {distance !== undefined && (
                      <div className="absolute top-2 left-2 bg-blue-600/90 backdrop-blur-xs text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                        <Navigation className="w-3 h-3 fill-white" />
                        <span>{formatDistance(distance)}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">{item.pandalName}</h3>
                        {distance !== undefined && !item.image && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md mt-1 border border-blue-200">
                            <Navigation className="w-3 h-3 fill-blue-600" />
                            {formatDistance(distance)}
                          </span>
                        )}
                      </div>
                      <span className="bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                        {item.area}
                      </span>
                    </div>

                    <div className="text-xs text-gray-600 space-y-1.5 pt-1">
                      <p className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>Date: <strong className="text-gray-800">{item.date}</strong></span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>Timings: <strong className="text-gray-800">{item.startTime} {item.endTime ? `- ${item.endTime}` : ''}</strong></span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="truncate">{item.address}</span>
                      </p>
                    </div>

                    {item.description && (
                      <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                        {item.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 gap-2">
                    {item.contactInfo ? (
                      <span className="flex items-center gap-1 min-w-0">
                        <Phone className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span className="truncate">{item.contactInfo}</span>
                      </span>
                    ) : (
                      <span />
                    )}

                    <button
                      onClick={() => handleGetDirections(item)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-xs transition-colors shrink-0"
                      title="Get driving directions to Annadanam"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>Directions</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

