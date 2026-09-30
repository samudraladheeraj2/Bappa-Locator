/**
 * Duplicate Pin Location & Submission Detector
 * Detects whether a set of coordinates or pandal submission matches an existing
 * live/verified pandal or another pending/suggested submission.
 */

import { Pandal, Annadanam } from '../types';
import { normalizeDate } from './chronologyHelper';

export interface MatchedPandalItem {
  id: string;
  name: string;
  address?: string;
  area?: string;
  committeeName?: string;
  status: 'approved' | 'pending';
  latitude: number;
  longitude: number;
  distanceMeters: number;
  photos?: string[];
  image?: string;
  ganeshaPhoto?: string;
  pandalPhoto?: string;
  submittedBy?: string;
  submittedByPhone?: string;
  createdAt?: any;
  rawItem?: any;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  type: 'live' | 'suggested' | null;
  message: string;
  matchedPandal: MatchedPandalItem | null;
  allMatches: MatchedPandalItem[];
  matchCount: number;
  liveMatches: MatchedPandalItem[];
  suggestedMatches: MatchedPandalItem[];
}

export interface MatchedAnnadanamItem {
  id: string;
  pandalName: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  address?: string;
  area?: string;
  city?: string;
  status: 'approved' | 'pending';
  latitude: number;
  longitude: number;
  distanceMeters: number;
  photos?: string[];
  image?: string;
  description?: string;
  contactInfo?: string;
  submittedBy?: string;
  submittedByEmail?: string;
  createdAt?: any;
  rawItem?: any;
}

export interface DuplicateAnnadanamCheckResult {
  isDuplicate: boolean;
  type: 'live' | 'suggested' | null;
  message: string;
  matchedAnnadanam: MatchedAnnadanamItem | null;
  allMatches: MatchedAnnadanamItem[];
  matchCount: number;
  liveMatches: MatchedAnnadanamItem[];
  suggestedMatches: MatchedAnnadanamItem[];
}

/**
 * Calculates surface distance between two GPS coordinates in meters using Haversine formula
 */
export function getCoordinatesDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (
    typeof lat1 !== 'number' ||
    typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lon2 !== 'number' ||
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2)
  ) {
    return Infinity;
  }

  // Exact float equality
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks whether coordinates duplicate existing live pandals or pending submissions.
 * Returns ALL matches sorted chronologically (live/earliest first).
 * Threshold: Within ~45 meters (or matching 4 decimal places).
 */
export function checkDuplicateLocation(
  latitude: number,
  longitude: number,
  livePandals: Pandal[] = [],
  pendingSubmissions: any[] = [],
  currentSubmissionId?: string,
  thresholdMeters: number = 45
): DuplicateCheckResult {
  if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
    return {
      isDuplicate: false,
      type: null,
      message: '',
      matchedPandal: null,
      allMatches: [],
      matchCount: 0,
      liveMatches: [],
      suggestedMatches: [],
    };
  }

  const matchesMap = new Map<string, MatchedPandalItem>();

  // 1. Check against LIVE / VERIFIED pandals
  for (const live of livePandals) {
    if (!live.latitude || !live.longitude) continue;
    if (currentSubmissionId && live.id === currentSubmissionId) continue;

    const dist = getCoordinatesDistanceMeters(latitude, longitude, live.latitude, live.longitude);
    const isExact4Dec =
      latitude.toFixed(4) === live.latitude.toFixed(4) &&
      longitude.toFixed(4) === live.longitude.toFixed(4);

    if (dist <= thresholdMeters || isExact4Dec) {
      const photos = (live as any).photos || ((live as any).image ? [(live as any).image] : []);
      matchesMap.set(live.id, {
        id: live.id,
        name: live.name,
        address: live.address,
        area: live.area,
        committeeName: (live as any).committeeName,
        status: 'approved',
        latitude: live.latitude,
        longitude: live.longitude,
        distanceMeters: Math.round(dist),
        photos,
        image: live.image || photos[0] || (live as any).ganeshaPhoto || (live as any).pandalPhoto,
        ganeshaPhoto: (live as any).ganeshaPhoto,
        pandalPhoto: (live as any).pandalPhoto,
        submittedBy: (live as any).submittedBy,
        submittedByPhone: (live as any).submittedByPhone,
        createdAt: (live as any).createdAt,
        rawItem: live,
      });
    }
  }

  // 2. Check against PENDING / SUGGESTED submissions in Firestore
  for (const pending of pendingSubmissions) {
    if (!pending.latitude || !pending.longitude) continue;
    if (currentSubmissionId && pending.id === currentSubmissionId) continue;
    if (pending.status === 'rejected') continue; // Ignore rejected ones
    if (matchesMap.has(pending.id)) continue;

    const lat = Number(pending.latitude);
    const lng = Number(pending.longitude);
    if (isNaN(lat) || isNaN(lng)) continue;

    const dist = getCoordinatesDistanceMeters(latitude, longitude, lat, lng);
    const isExact4Dec = latitude.toFixed(4) === lat.toFixed(4) && longitude.toFixed(4) === lng.toFixed(4);

    if (dist <= thresholdMeters || isExact4Dec) {
      const isApproved = pending.status === 'approved';
      const photos = pending.photos || (pending.image ? [pending.image] : []);
      matchesMap.set(pending.id, {
        id: pending.id,
        name: pending.name || 'Pandal Submission',
        address: pending.address,
        area: pending.area,
        committeeName: pending.committeeName,
        status: isApproved ? 'approved' : 'pending',
        latitude: lat,
        longitude: lng,
        distanceMeters: Math.round(dist),
        photos,
        image: pending.image || photos[0] || pending.ganeshaPhoto || pending.pandalPhoto,
        ganeshaPhoto: pending.ganeshaPhoto,
        pandalPhoto: pending.pandalPhoto,
        submittedBy: pending.submittedBy,
        submittedByPhone: pending.submittedByPhone,
        createdAt: pending.createdAt,
        rawItem: pending,
      });
    }
  }

  const allMatchesList = Array.from(matchesMap.values());

  if (allMatchesList.length === 0) {
    return {
      isDuplicate: false,
      type: null,
      message: '',
      matchedPandal: null,
      allMatches: [],
      matchCount: 0,
      liveMatches: [],
      suggestedMatches: [],
    };
  }

  // Sort matches chronologically: Live/Approved first, then by earliest createdAt
  const sortedMatches = allMatchesList.sort((a, b) => {
    if (a.status === 'approved' && b.status !== 'approved') return -1;
    if (a.status !== 'approved' && b.status === 'approved') return 1;

    const dateA = normalizeDate(a.createdAt);
    const dateB = normalizeDate(b.createdAt);

    if (dateA && dateB) {
      return dateA.getTime() - dateB.getTime();
    }
    if (!dateA && dateB) return -1; // No date usually means existing base data
    if (dateA && !dateB) return 1;
    return 0;
  });

  const liveMatches = sortedMatches.filter((m) => m.status === 'approved');
  const suggestedMatches = sortedMatches.filter((m) => m.status !== 'approved');
  const primaryMatch = sortedMatches[0];
  const hasLive = liveMatches.length > 0;

  let message = '';
  if (sortedMatches.length > 1) {
    if (hasLive) {
      message = `Matches ${sortedMatches.length} entries (${liveMatches.length} Live, ${suggestedMatches.length} suggested)`;
    } else {
      message = `Matches ${sortedMatches.length} earlier suggestions`;
    }
  } else {
    message = hasLive ? 'This pandal is already live' : 'This pandal is already suggested';
  }

  return {
    isDuplicate: true,
    type: hasLive ? 'live' : 'suggested',
    message,
    matchedPandal: primaryMatch,
    allMatches: sortedMatches,
    matchCount: sortedMatches.length,
    liveMatches,
    suggestedMatches,
  };
}

/**
 * Checks whether Annadanam coordinates duplicate existing live schedules or pending Annadanam suggestions.
 * Returns ALL matches sorted chronologically (live/earliest first).
 * Threshold: Within ~45 meters (or matching 4 decimal places).
 */
export function checkDuplicateAnnadanamLocation(
  latitude: number,
  longitude: number,
  liveAnnadanam: Annadanam[] = [],
  pendingAnnadanam: any[] = [],
  currentSubmissionId?: string,
  thresholdMeters: number = 45
): DuplicateAnnadanamCheckResult {
  if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
    return {
      isDuplicate: false,
      type: null,
      message: '',
      matchedAnnadanam: null,
      allMatches: [],
      matchCount: 0,
      liveMatches: [],
      suggestedMatches: [],
    };
  }

  const matchesMap = new Map<string, MatchedAnnadanamItem>();

  // 1. Check against approved / live Annadanam schedules
  for (const live of liveAnnadanam) {
    if (!live.latitude || !live.longitude) continue;
    if (currentSubmissionId && live.id === currentSubmissionId) continue;

    const lat = Number(live.latitude);
    const lng = Number(live.longitude);
    if (isNaN(lat) || isNaN(lng)) continue;

    const dist = getCoordinatesDistanceMeters(latitude, longitude, lat, lng);
    const isExact4Dec =
      latitude.toFixed(4) === lat.toFixed(4) &&
      longitude.toFixed(4) === lng.toFixed(4);

    if (dist <= thresholdMeters || isExact4Dec) {
      const photos = (live as any).photos || (live.image ? [live.image] : []);
      matchesMap.set(live.id, {
        id: live.id,
        pandalName: live.pandalName,
        date: live.date,
        startTime: live.startTime,
        endTime: live.endTime,
        address: live.address,
        area: live.area,
        city: live.city,
        status: 'approved',
        latitude: lat,
        longitude: lng,
        distanceMeters: Math.round(dist),
        photos,
        image: live.image || photos[0],
        description: live.description,
        contactInfo: live.contactInfo,
        submittedBy: (live as any).submittedBy,
        submittedByEmail: (live as any).submittedByEmail,
        createdAt: (live as any).createdAt,
        rawItem: live,
      });
    }
  }

  // 2. Check against pending / suggested Annadanam in Firestore
  for (const pending of pendingAnnadanam) {
    if (!pending.latitude || !pending.longitude) continue;
    if (currentSubmissionId && pending.id === currentSubmissionId) continue;
    if (pending.status === 'rejected') continue;
    if (matchesMap.has(pending.id)) continue;

    const lat = Number(pending.latitude);
    const lng = Number(pending.longitude);
    if (isNaN(lat) || isNaN(lng)) continue;

    const dist = getCoordinatesDistanceMeters(latitude, longitude, lat, lng);
    const isExact4Dec =
      latitude.toFixed(4) === lat.toFixed(4) &&
      longitude.toFixed(4) === lng.toFixed(4);

    if (dist <= thresholdMeters || isExact4Dec) {
      const isApproved = pending.status === 'approved';
      const photos = pending.photos || (pending.image ? [pending.image] : []);
      matchesMap.set(pending.id, {
        id: pending.id,
        pandalName: pending.pandalName || 'Annadanam Schedule',
        date: pending.date,
        startTime: pending.startTime,
        endTime: pending.endTime,
        address: pending.address,
        area: pending.area,
        city: pending.city,
        status: isApproved ? 'approved' : 'pending',
        latitude: lat,
        longitude: lng,
        distanceMeters: Math.round(dist),
        photos,
        image: pending.image || photos[0],
        description: pending.description,
        contactInfo: pending.contactInfo,
        submittedBy: pending.submittedBy,
        submittedByEmail: pending.submittedByEmail,
        createdAt: pending.createdAt,
        rawItem: pending,
      });
    }
  }

  const allMatchesList = Array.from(matchesMap.values());

  if (allMatchesList.length === 0) {
    return {
      isDuplicate: false,
      type: null,
      message: '',
      matchedAnnadanam: null,
      allMatches: [],
      matchCount: 0,
      liveMatches: [],
      suggestedMatches: [],
    };
  }

  // Sort matches chronologically: Live/Approved first, then by earliest createdAt
  const sortedMatches = allMatchesList.sort((a, b) => {
    if (a.status === 'approved' && b.status !== 'approved') return -1;
    if (a.status !== 'approved' && b.status === 'approved') return 1;

    const dateA = normalizeDate(a.createdAt);
    const dateB = normalizeDate(b.createdAt);

    if (dateA && dateB) {
      return dateA.getTime() - dateB.getTime();
    }
    if (!dateA && dateB) return -1;
    if (dateA && !dateB) return 1;
    return 0;
  });

  const liveMatches = sortedMatches.filter((m) => m.status === 'approved');
  const suggestedMatches = sortedMatches.filter((m) => m.status !== 'approved');
  const primaryMatch = sortedMatches[0];
  const hasLive = liveMatches.length > 0;

  let message = '';
  if (sortedMatches.length > 1) {
    if (hasLive) {
      message = `Matches ${sortedMatches.length} entries (${liveMatches.length} Live, ${suggestedMatches.length} suggested)`;
    } else {
      message = `Matches ${sortedMatches.length} earlier suggestions`;
    }
  } else {
    message = hasLive ? 'This Annadanam is already live' : 'This Annadanam is already suggested';
  }

  return {
    isDuplicate: true,
    type: hasLive ? 'live' : 'suggested',
    message,
    matchedAnnadanam: primaryMatch,
    allMatches: sortedMatches,
    matchCount: sortedMatches.length,
    liveMatches,
    suggestedMatches,
  };
}

