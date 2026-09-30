import { Pandal, YearlyPandalPhoto } from '../types';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

export const CURRENT_FESTIVAL_YEAR = 2027;
const VOTED_PHOTOS_STORAGE_KEY = 'bappa_voted_photo_ids';

export interface CoverPhotoDisplayInfo {
  coverUrl: string;
  year: number;
  uploaderName: string;
  votesCount: number;
  isCurrentYear: boolean;
  isTopVoted?: boolean;
  fallbackBadge?: string;
  photo?: YearlyPandalPhoto;
}

/**
 * Returns current active festival year (2026)
 */
export function getCurrentActiveFestivalYear(): number {
  return CURRENT_FESTIVAL_YEAR;
}

/**
 * Resolves the primary cover photo for a pandal based on yearly crowdsourced idol architecture:
 * 1. Checks for APPROVED photos uploaded for 2026.
 * 2. If present, selects the photo with the highest community upvotes.
 * 3. If none approved yet for 2026, falls back to static pandal cover photo or prior photos
 *    and provides the fallback badge: "Awaiting 2026 Update".
 */
export function getCoverPhotoMetadata(
  pandal: Pandal | null | undefined,
  targetYear: number = CURRENT_FESTIVAL_YEAR
): CoverPhotoDisplayInfo {
  const defaultFallbackImg =
    'https://images.unsplash.com/photo-1567591414240-e2ffad27b3fa?auto=format&fit=crop&w=800&q=80';

  if (!pandal) {
    return {
      coverUrl: defaultFallbackImg,
      year: targetYear,
      uploaderName: 'Devotee',
      votesCount: 0,
      isCurrentYear: false,
      fallbackBadge: `Awaiting ${targetYear} Update`,
    };
  }

  const yearlyPhotos = pandal.yearlyPhotos || [];

  // 1. Check for APPROVED photos for target year (2026)
  const approved2026Photos = yearlyPhotos.filter(
    (p) => p.year === targetYear && (!p.status || p.status === 'approved')
  );

  if (approved2026Photos.length > 0) {
    const sorted = [...approved2026Photos].sort((a, b) => {
      if (b.votesCount !== a.votesCount) {
        return b.votesCount - a.votesCount;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const topPhoto = sorted[0];
    return {
      coverUrl: topPhoto.url,
      year: targetYear,
      uploaderName: topPhoto.uploaderName || 'Devotee',
      votesCount: topPhoto.votesCount || 0,
      isCurrentYear: true,
      isTopVoted: true,
      photo: topPhoto,
    };
  }

  // 2. Check for prior approved year photos in yearlyPhotos
  const priorApproved = yearlyPhotos.filter((p) => !p.status || p.status === 'approved');
  if (priorApproved.length > 0) {
    const priorSorted = [...priorApproved].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.votesCount - a.votesCount;
    });
    const priorPhoto = priorSorted[0];
    const priorYear = priorPhoto.year || 2025;
    return {
      coverUrl: priorPhoto.url,
      year: priorYear,
      uploaderName: priorPhoto.uploaderName || 'Community Archive',
      votesCount: priorPhoto.votesCount || 0,
      isCurrentYear: false,
      fallbackBadge: `${priorYear} Photo - Awaiting ${targetYear} Update`,
      photo: priorPhoto,
    };
  }

  // 3. Fallback to existing static pandal photo
  const fallbackUrl =
    pandal.ganeshaImage ||
    pandal.image ||
    (pandal.photos && pandal.photos.length > 0 ? pandal.photos[0] : defaultFallbackImg);

  return {
    coverUrl: fallbackUrl,
    year: 2026,
    uploaderName: pandal.submittedBy || 'Bappa Archive',
    votesCount: 0,
    isCurrentYear: false,
    fallbackBadge: `Awaiting ${targetYear} Update`,
  };
}

/**
 * Check if the user has already upvoted/confirmed a photo
 */
export function hasUserVotedForPhoto(photoId: string): boolean {
  try {
    const raw = localStorage.getItem(VOTED_PHOTOS_STORAGE_KEY);
    if (!raw) return false;
    const votedList: string[] = JSON.parse(raw);
    return Array.isArray(votedList) && votedList.includes(photoId);
  } catch {
    return false;
  }
}

/**
 * Record user vote in local storage
 */
export function recordUserVote(photoId: string, hasVoted: boolean): void {
  try {
    const raw = localStorage.getItem(VOTED_PHOTOS_STORAGE_KEY);
    let votedList: string[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(votedList)) votedList = [];

    if (hasVoted) {
      if (!votedList.includes(photoId)) votedList.push(photoId);
    } else {
      votedList = votedList.filter((id) => id !== photoId);
    }
    localStorage.setItem(VOTED_PHOTOS_STORAGE_KEY, JSON.stringify(votedList));
  } catch (e) {
    console.warn('Could not record vote in storage:', e);
  }
}

/**
 * Upvotes or removes upvote on a yearly crowdsourced photo in Firestore
 */
export async function toggleYearlyPhotoVote(
  pandalId: string,
  photoId: string,
  userIdentifier: string = 'devotee_' + Math.random().toString(36).slice(2, 8)
): Promise<{ success: boolean; newVotesCount: number; isVotedNow: boolean }> {
  const isCurrentlyVoted = hasUserVotedForPhoto(photoId);
  const willBeVoted = !isCurrentlyVoted;

  recordUserVote(photoId, willBeVoted);

  try {
    const pandalRef = doc(db, 'submissions', pandalId);
    const snap = await getDoc(pandalRef);

    if (snap.exists()) {
      const data = snap.data();
      const existingPhotos: YearlyPandalPhoto[] = data.yearlyPhotos || [];

      let newCount = 0;
      const updatedPhotos = existingPhotos.map((p) => {
        if (p.id === photoId) {
          const currentVotes = typeof p.votesCount === 'number' ? p.votesCount : 0;
          newCount = willBeVoted ? currentVotes + 1 : Math.max(0, currentVotes - 1);
          const currentVoters = p.votedUserIds || [];
          const updatedVoters = willBeVoted
            ? [...currentVoters, userIdentifier]
            : currentVoters.filter((id) => id !== userIdentifier);

          return {
            ...p,
            votesCount: newCount,
            votedUserIds: updatedVoters,
          };
        }
        return p;
      });

      // Recalculate primary cover among approved photos for 2026
      const approvedCurrentYear = updatedPhotos.filter(
        (p) => p.year === CURRENT_FESTIVAL_YEAR && (!p.status || p.status === 'approved')
      );
      if (approvedCurrentYear.length > 0) {
        approvedCurrentYear.sort((a, b) => b.votesCount - a.votesCount);
        const topCover = approvedCurrentYear[0];
        await updateDoc(pandalRef, {
          yearlyPhotos: updatedPhotos,
          image: topCover.url,
          ganeshaImage: topCover.url,
        });
      } else {
        await updateDoc(pandalRef, {
          yearlyPhotos: updatedPhotos,
        });
      }

      return { success: true, newVotesCount: newCount, isVotedNow: willBeVoted };
    }
  } catch (err) {
    console.warn('Firestore vote update skipped:', err);
  }

  return { success: true, newVotesCount: willBeVoted ? 1 : 0, isVotedNow: willBeVoted };
}
