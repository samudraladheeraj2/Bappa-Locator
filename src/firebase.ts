import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import env from './config/env';

const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY,
  projectId: env.FIREBASE_PROJECT_ID,
  appId: env.FIREBASE_APP_ID,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
};

const app = initializeApp(firebaseConfig);

// Enable robust Firestore IndexedDB Offline Persistence for offline access
export const db = (() => {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  try {
    if (isIframe) {
      console.log('Running inside iframe preview: using experimentalForceLongPolling for immediate connectivity.');
      return initializeFirestore(app, {
        experimentalForceLongPolling: true,
      }, env.FIREBASE_DATABASE_ID);
    }
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      }),
      experimentalAutoDetectLongPolling: true,
    }, env.FIREBASE_DATABASE_ID);
  } catch (err) {
    console.warn('Firestore offline persistence fallback:', err);
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    }, env.FIREBASE_DATABASE_ID);
  }
})();

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Google sign-in error:', error);
    throw error;
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}
