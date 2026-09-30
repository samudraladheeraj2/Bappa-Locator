import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { hashPin } from './crypto';

export const ADMIN_MOBILE = '7702583629';
export const ADMIN_PIN = '0796';
export const ADMIN_EMAIL = 'samudraladheeraj2@gmail.com';

/**
 * Ensures that the Admin user document exists in Firestore with phone number 7702583629
 * and hashed PIN 0796. If not present, creates it automatically.
 */
export async function ensureAdminExists(): Promise<boolean> {
  try {
    const userRef = doc(db, 'users', ADMIN_MOBILE);
    const userSnap = await getDoc(userRef);
    const expectedPinHash = await hashPin(ADMIN_PIN);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        mobile: ADMIN_MOBILE,
        pinHash: expectedPinHash,
        role: 'admin',
        isAdmin: true,
        displayName: 'Admin (7702583629)',
        createdAt: new Date().toISOString(),
      });
      console.log(`Admin ID (${ADMIN_MOBILE}) initialized in Firestore successfully.`);
      return true;
    } else {
      const data = userSnap.data();
      // Ensure pinHash and admin privileges are up-to-date
      if (!data.isAdmin || data.role !== 'admin' || data.pinHash !== expectedPinHash) {
        await setDoc(
          userRef,
          {
            mobile: ADMIN_MOBILE,
            pinHash: expectedPinHash,
            role: 'admin',
            isAdmin: true,
            displayName: data.displayName || 'Admin (7702583629)',
          },
          { merge: true }
        );
        console.log(`Admin ID (${ADMIN_MOBILE}) privileges updated in Firestore.`);
      }
      return true;
    }
  } catch (err) {
    console.warn('Admin account initialization notice:', err);
    return false;
  }
}

/**
 * Helper to check if a given user/mobile represents the Admin.
 */
export function checkIsAdminUser(
  user?: { email?: string | null } | null,
  mobileUser?: { mobile?: string } | null
): boolean {
  if (user && user.email === ADMIN_EMAIL) return true;
  if (mobileUser && mobileUser.mobile === ADMIN_MOBILE) return true;

  try {
    const savedMobile = localStorage.getItem('bappa_mobile_user');
    if (savedMobile) {
      const parsed = JSON.parse(savedMobile);
      if (parsed && parsed.mobile === ADMIN_MOBILE) return true;
    }
  } catch {
    // Ignore storage parse errors
  }

  return false;
}
