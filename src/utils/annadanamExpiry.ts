/**
 * Annadanam Schedule Lifecycle & Auto-Expiry Management
 *
 * Rule:
 * If Annadanam is suggested for a given date (or suggested today), it shows live or for approval:
 * - On the day of the event (Today)
 * - On the next day (Tomorrow)
 * - The day after tomorrow and beyond, it is considered expired and automatically removed from the database.
 */

import { db } from '../firebase';
import { doc, deleteDoc } from 'firebase/firestore';

/**
 * Checks whether an Annadanam record has expired (> 1 day after event date / creation date)
 */
export function isAnnadanamExpired(dateStr?: string, createdAtStr?: string): boolean {
  try {
    const now = new Date();
    // Midnight of current day in local time
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    let eventDate: Date | null = null;

    if (dateStr && typeof dateStr === 'string' && dateStr.trim().length > 0) {
      const trimmed = dateStr.trim();
      // Format 1: YYYY-MM-DD
      const ymdParts = trimmed.split('-');
      if (ymdParts.length === 3) {
        const y = parseInt(ymdParts[0], 10);
        const m = parseInt(ymdParts[1], 10) - 1;
        const d = parseInt(ymdParts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          eventDate = new Date(y, m, d);
        }
      }

      // Format 2: DD/MM/YYYY or DD-MM-YYYY
      if (!eventDate || isNaN(eventDate.getTime())) {
        const dmyParts = trimmed.split(/[/.-]/);
        if (dmyParts.length === 3 && dmyParts[0].length <= 2 && dmyParts[2].length === 4) {
          const d = parseInt(dmyParts[0], 10);
          const m = parseInt(dmyParts[1], 10) - 1;
          const y = parseInt(dmyParts[2], 10);
          if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            eventDate = new Date(y, m, d);
          }
        }
      }

      // Format 3: Generic Date parse
      if (!eventDate || isNaN(eventDate.getTime())) {
        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) {
          eventDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        }
      }
    }

    // Fallback to createdAt if date is missing or couldn't be parsed
    if ((!eventDate || isNaN(eventDate.getTime())) && createdAtStr) {
      const parsedCreated = new Date(createdAtStr);
      if (!isNaN(parsedCreated.getTime())) {
        eventDate = new Date(parsedCreated.getFullYear(), parsedCreated.getMonth(), parsedCreated.getDate());
      }
    }

    // If no date can be found, do not expire prematurely
    if (!eventDate || isNaN(eventDate.getTime())) {
      return false;
    }

    const eventMidnight = new Date(
      eventDate.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate()
    ).getTime();

    // Calculate full days difference: today - eventDate
    // Example:
    // Event Date: Sep 30
    // Sep 30 (Today) -> diff = 0 days -> NOT expired
    // Oct 1 (Tomorrow) -> diff = 1 day -> NOT expired
    // Oct 2 (Day after tomorrow) -> diff = 2 days -> EXPIRED (>= 2 days)
    const msDifference = todayMidnight - eventMidnight;
    const daysPassed = Math.floor(msDifference / (1000 * 60 * 60 * 24));

    return daysPassed >= 2;
  } catch (err) {
    console.warn('Error checking Annadanam expiry:', err);
    return false;
  }
}

/**
 * Automatically purges expired Annadanam records from Firestore in the background
 */
export async function cleanupExpiredAnnadanam(records: any[]): Promise<string[]> {
  if (!Array.isArray(records) || records.length === 0) return [];

  const deletedIds: string[] = [];
  const deletePromises: Promise<void>[] = [];

  for (const item of records) {
    if (!item || !item.id) continue;
    
    // Check if this record is from static demo data or Firestore
    // Static data with 'anna-1', 'anna-2' can just be filtered client-side,
    // Firestore records usually have custom IDs or doc IDs.
    const isExpired = isAnnadanamExpired(item.date, item.createdAt);
    if (isExpired) {
      deletedIds.push(item.id);

      // Trigger deletion from Firestore if not pure local demo item
      if (typeof item.id === 'string' && !item.id.startsWith('bs_')) {
        deletePromises.push(
          deleteDoc(doc(db, 'annadanam', item.id)).catch((err) => {
            console.warn(`Could not delete expired Annadanam ${item.id}:`, err);
          })
        );
      }
    }
  }

  if (deletePromises.length > 0) {
    await Promise.allSettled(deletePromises);
  }

  return deletedIds;
}
