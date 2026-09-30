/**
 * Anti-Spam Throttler & Client-Side Rate Limiter
 * Guards form submissions, upvotes, and OTP requests against automated bot spam
 */

const RATE_LIMIT_STORAGE_KEY = 'bappa_action_timestamps';

interface RateLimitTracker {
  [actionKey: string]: number[];
}

/**
 * Checks if an action is permitted within a specified time window
 * @param actionName Name of action (e.g., 'pandal_submission', 'idol_photo_upload')
 * @param maxAllowed Maximum allowed actions in the time window
 * @param windowMs Time window in milliseconds (e.g., 60000 for 1 minute)
 */
export function checkRateLimit(
  actionName: string,
  maxAllowed = 3,
  windowMs = 60000
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();

  try {
    const raw = localStorage.getItem(RATE_LIMIT_STORAGE_KEY);
    const tracker: RateLimitTracker = raw ? JSON.parse(raw) : {};

    const timestamps = tracker[actionName] || [];
    // Filter timestamps within the current sliding window
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= maxAllowed) {
      const oldestInWindow = recent[0];
      const retryAfterSec = Math.ceil((windowMs - (now - oldestInWindow)) / 1000);
      return { allowed: false, retryAfterSec };
    }

    // Record action timestamp
    recent.push(now);
    tracker[actionName] = recent;
    localStorage.setItem(RATE_LIMIT_STORAGE_KEY, JSON.stringify(tracker));

    return { allowed: true, retryAfterSec: 0 };
  } catch {
    return { allowed: true, retryAfterSec: 0 };
  }
}
