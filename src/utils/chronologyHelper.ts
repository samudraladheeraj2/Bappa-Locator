/**
 * Chronology & Timestamp Comparison Helper
 * Helps admins and users understand which submission came first,
 * the time difference between them, and whether a record is already approved or pending.
 */

export interface ChronologyComparison {
  earlierItem: 'first' | 'second' | 'same_time' | 'unknown';
  firstTimestampFormatted: string;
  secondTimestampFormatted: string;
  timeDifferenceText: string;
  summarySentence: string;
  firstIsLive: boolean;
  secondIsLive: boolean;
}

/**
 * Normalizes any timestamp representation (Firestore Timestamp, ISO string, epoch number, Date) to a Date object
 */
export function normalizeDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;

  // Firestore Timestamp with toMillis() or toDate()
  if (typeof ts.toDate === 'function') {
    try {
      return ts.toDate();
    } catch {
      // ignore
    }
  }
  if (typeof ts.toMillis === 'function') {
    try {
      return new Date(ts.toMillis());
    } catch {
      // ignore
    }
  }
  if (typeof ts.seconds === 'number') {
    return new Date(ts.seconds * 1000 + (ts.nanoseconds ? ts.nanoseconds / 1000000 : 0));
  }
  if (typeof ts === 'number') {
    return new Date(ts);
  }
  if (typeof ts === 'string') {
    const parsed = new Date(ts);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Formats a timestamp into human-friendly full date & time (e.g. "Sep 30, 2026, 04:15 PM")
 */
export function formatFriendlyDateTime(ts: any): string {
  const d = normalizeDate(ts);
  if (!d) return 'Earlier submission (Pre-existing)';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats relative duration between two dates (e.g. "2 hours later", "1 day later", "15 minutes earlier")
 */
export function formatTimeDifference(dateA: Date, dateB: Date): string {
  const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''}${diffHours % 24 > 0 ? ` ${diffHours % 24} hr` : ''}`;
  }
  if (diffHours > 0) {
    return `${diffHours} hr${diffHours > 1 ? 's' : ''}${diffMin % 60 > 0 ? ` ${diffMin % 60} min` : ''}`;
  }
  if (diffMin > 0) {
    return `${diffMin} min${diffMin > 1 ? 's' : ''}`;
  }
  return 'just seconds apart';
}

/**
 * Compares two submissions chronologically and produces user-facing badges & breakdown
 */
export function compareSubmissionChronology(
  currentSuggestion: { createdAt?: any; status?: string; name?: string; pandalName?: string },
  matchedExisting: { createdAt?: any; status?: string; name?: string; pandalName?: string; isLive?: boolean }
): ChronologyComparison {
  const dateCurrent = normalizeDate(currentSuggestion.createdAt);
  const dateMatched = normalizeDate(matchedExisting.createdAt);

  const currentStatus = currentSuggestion.status || 'pending';
  const matchedStatus = matchedExisting.status || (matchedExisting.isLive ? 'approved' : 'pending');
  const matchedIsLive = matchedStatus === 'approved' || !!matchedExisting.isLive;
  const currentIsLive = currentStatus === 'approved';

  const currentTitle = currentSuggestion.name || currentSuggestion.pandalName || 'This suggestion';
  const matchedTitle = matchedExisting.name || matchedExisting.pandalName || 'Existing record';

  const currentFormatted = formatFriendlyDateTime(currentSuggestion.createdAt);
  const matchedFormatted = formatFriendlyDateTime(matchedExisting.createdAt);

  if (matchedIsLive && !currentIsLive) {
    return {
      earlierItem: 'second', // matched item is the primary live item
      firstTimestampFormatted: currentFormatted,
      secondTimestampFormatted: matchedFormatted,
      timeDifferenceText: dateCurrent && dateMatched ? formatTimeDifference(dateCurrent, dateMatched) : '',
      summarySentence: `"${matchedTitle}" is already APPROVED & LIVE on the map. This submission is a later duplicate.`,
      firstIsLive: false,
      secondIsLive: true,
    };
  }

  if (!dateCurrent || !dateMatched) {
    return {
      earlierItem: 'second',
      firstTimestampFormatted: currentFormatted,
      secondTimestampFormatted: matchedFormatted,
      timeDifferenceText: '',
      summarySentence: `"${matchedTitle}" was recorded earlier in the system than this suggestion.`,
      firstIsLive: currentIsLive,
      secondIsLive: matchedIsLive,
    };
  }

  if (dateMatched.getTime() < dateCurrent.getTime()) {
    const diff = formatTimeDifference(dateMatched, dateCurrent);
    return {
      earlierItem: 'second',
      firstTimestampFormatted: currentFormatted,
      secondTimestampFormatted: matchedFormatted,
      timeDifferenceText: diff,
      summarySentence: `"${matchedTitle}" was submitted FIRST (${diff} earlier). This current submission is a duplicate submitted later.`,
      firstIsLive: currentIsLive,
      secondIsLive: matchedIsLive,
    };
  } else if (dateCurrent.getTime() < dateMatched.getTime()) {
    const diff = formatTimeDifference(dateCurrent, dateMatched);
    return {
      earlierItem: 'first',
      firstTimestampFormatted: currentFormatted,
      secondTimestampFormatted: matchedFormatted,
      timeDifferenceText: diff,
      summarySentence: `This submission was created ${diff} before "${matchedTitle}".`,
      firstIsLive: currentIsLive,
      secondIsLive: matchedIsLive,
    };
  }

  return {
    earlierItem: 'same_time',
    firstTimestampFormatted: currentFormatted,
    secondTimestampFormatted: matchedFormatted,
    timeDifferenceText: 'same time',
    summarySentence: `Both entries were submitted at nearly identical times with matching pin coordinates.`,
    firstIsLive: currentIsLive,
    secondIsLive: matchedIsLive,
  };
}

export interface TimelineEntry {
  id: string;
  name: string;
  createdAt: any;
  normalizedDate: Date | null;
  formattedDate: string;
  timeDifferenceFromPrevious?: string;
  timeDifferenceFromFirst?: string;
  status: 'approved' | 'pending' | 'rejected';
  isLive: boolean;
  isCurrent: boolean;
  rank: number; // 1 for first/earliest, 2 for second, etc.
  submittedBy?: string;
  distanceMeters?: number;
  rawItem?: any;
}

export interface MultiSubmissionTimeline {
  entries: TimelineEntry[];
  totalCount: number;
  earliestEntry: TimelineEntry;
  currentEntry: TimelineEntry | null;
  currentIndex: number;
  hasLiveMatch: boolean;
  summarySentence: string;
}

/**
 * Builds a chronological sequence of all matching submissions at a coordinate location
 */
export function buildMultiSubmissionTimeline(
  currentSubmission: { id?: string; name?: string; pandalName?: string; createdAt?: any; status?: string; submittedBy?: string; latitude?: number; longitude?: number; [key: string]: any },
  matchedItems: Array<{ id?: string; name?: string; pandalName?: string; createdAt?: any; status?: string; submittedBy?: string; distanceMeters?: number; [key: string]: any }>
): MultiSubmissionTimeline {
  // Combine all items into a single list deduplicated by id
  const itemMap = new Map<string, any>();

  // Add matched items
  matchedItems.forEach((item) => {
    if (item && item.id) {
      itemMap.set(item.id, item);
    }
  });

  // Add current submission
  if (currentSubmission && currentSubmission.id) {
    itemMap.set(currentSubmission.id, {
      ...currentSubmission,
      distanceMeters: 0,
    });
  }

  const allItems = Array.from(itemMap.values());

  // Sort chronologically:
  // 1. Items with approved status / live or earliest timestamp come first
  const sorted = allItems.sort((a, b) => {
    const isLiveA = a.status === 'approved';
    const isLiveB = b.status === 'approved';
    if (isLiveA && !isLiveB) return -1;
    if (!isLiveA && isLiveB) return 1;

    const dateA = normalizeDate(a.createdAt);
    const dateB = normalizeDate(b.createdAt);

    if (dateA && dateB) {
      return dateA.getTime() - dateB.getTime();
    }
    if (dateA && !dateB) return 1; // Unspecified dates on pre-existing live items usually mean original
    if (!dateA && dateB) return -1;
    return 0;
  });

  const firstDate = normalizeDate(sorted[0]?.createdAt);

  const entries: TimelineEntry[] = sorted.map((item, index) => {
    const itemDate = normalizeDate(item.createdAt);
    const prevItemDate = index > 0 ? normalizeDate(sorted[index - 1]?.createdAt) : null;
    const isCurrent = item.id === currentSubmission.id;
    const isLive = item.status === 'approved';

    let timeDiffFromPrev = '';
    if (index > 0 && itemDate && prevItemDate) {
      timeDiffFromPrev = formatTimeDifference(prevItemDate, itemDate);
    }

    let timeDiffFromFirst = '';
    if (index > 0 && itemDate && firstDate) {
      timeDiffFromFirst = formatTimeDifference(firstDate, itemDate);
    }

    return {
      id: item.id || `item_${index}`,
      name: item.name || item.pandalName || `Submission #${index + 1}`,
      createdAt: item.createdAt,
      normalizedDate: itemDate,
      formattedDate: formatFriendlyDateTime(item.createdAt),
      timeDifferenceFromPrevious: timeDiffFromPrev,
      timeDifferenceFromFirst: timeDiffFromFirst,
      status: item.status || (isLive ? 'approved' : 'pending'),
      isLive,
      isCurrent,
      rank: index + 1,
      submittedBy: item.submittedBy || item.submittedByEmail || item.contactPerson,
      distanceMeters: item.distanceMeters,
      rawItem: item,
    };
  });

  const currentIndex = entries.findIndex((e) => e.isCurrent);
  const currentEntry = currentIndex >= 0 ? entries[currentIndex] : null;
  const earliestEntry = entries[0];
  const hasLiveMatch = entries.some((e) => e.isLive);

  let summarySentence = '';
  if (entries.length > 2) {
    if (currentEntry && currentEntry.rank === 1) {
      summarySentence = `This submission is the ORIGINAL (1st of ${entries.length} matching submissions at this location).`;
    } else if (currentEntry) {
      summarySentence = `This submission is #${currentEntry.rank} of ${entries.length} matching records at this pin. Original was submitted ${currentEntry.timeDifferenceFromFirst ? `${currentEntry.timeDifferenceFromFirst} earlier` : 'earlier'}${hasLiveMatch ? ' and is already Live on map' : ''}.`;
    } else {
      summarySentence = `Found ${entries.length} duplicate submissions matching these coordinates.`;
    }
  } else if (entries.length === 2) {
    if (hasLiveMatch) {
      summarySentence = `Matches 1 Live Pandal on the map. This submission is a duplicate.`;
    } else {
      summarySentence = `Found 2 suggestions for this location. 1st submission was created earlier.`;
    }
  } else {
    summarySentence = `No other duplicates detected for this location.`;
  }

  return {
    entries,
    totalCount: entries.length,
    earliestEntry,
    currentEntry,
    currentIndex: currentIndex >= 0 ? currentIndex : 0,
    hasLiveMatch,
    summarySentence,
  };
}

