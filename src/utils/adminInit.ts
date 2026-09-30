import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { hashPin, syncHashPin } from './crypto';
import { withTimeout } from './asyncHelper';

export const ADMIN_MOBILE = '7702583629';
export const ADMIN_PIN = '0796';
export const ADMIN_EMAIL = 'samudraladheeraj2@gmail.com';

/**
 * Ensures that the Admin user document exists in Firestore with phone number 7702583629
 * and hashed PIN 0796. If not present, creates it automatically.
 */
export async function ensureAdminExists(): Promise<boolean> {
  console.log(`[AdminInit] Verifying Admin doc (${ADMIN_MOBILE}) in Firestore...`);
  try {
    return await withTimeout(
      (async () => {
        const userRef = doc(db, 'users', ADMIN_MOBILE);
        const userSnap = await getDoc(userRef);
        const expectedPinHash = syncHashPin(ADMIN_PIN);

        if (!userSnap.exists()) {
          console.log(`[AdminInit] Admin doc does not exist yet. Creating doc for ${ADMIN_MOBILE}...`);
          await setDoc(userRef, {
            mobile: ADMIN_MOBILE,
            pinHash: expectedPinHash,
            role: 'admin',
            isAdmin: true,
            displayName: 'Admin (7702583629)',
            createdAt: new Date().toISOString(),
          });
          console.log(`[AdminInit SUCCESS] Admin ID (${ADMIN_MOBILE}) created in Firestore.`);
          return true;
        } else {
          const data = userSnap.data();
          if (!data.isAdmin || data.role !== 'admin' || data.pinHash !== expectedPinHash) {
            console.log(`[AdminInit] Updating Admin privileges/hash in Firestore for ${ADMIN_MOBILE}...`);
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
            console.log(`[AdminInit SUCCESS] Admin ID (${ADMIN_MOBILE}) privileges updated.`);
          } else {
            console.log(`[AdminInit SUCCESS] Admin ID (${ADMIN_MOBILE}) already up to date.`);
          }
          return true;
        }
      })(),
      5000,
      'Admin Firestore verification timed out after 5s'
    );
  } catch (err) {
    console.warn('[AdminInit NOTICE] Firestore Admin sync notice (non-fatal):', err);
    return false;
  }
}

let inMemoryAdminState = false;

export function setInMemoryAdmin(isAdmin: boolean) {
  inMemoryAdminState = isAdmin;
}

/**
 * Helper to check if a given user/mobile represents the Admin.
 */
export function checkIsAdminUser(
  user?: { email?: string | null } | null,
  mobileUser?: { mobile?: string } | null
): boolean {
  if (inMemoryAdminState) return true;
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
