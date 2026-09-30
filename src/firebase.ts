import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
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

// Enable robust Firestore connection with long-polling fallback for web & Cloud Run
export const db = (() => {
  const isWebOrIframe = typeof window !== 'undefined';

  try {
    console.log('Connecting Firestore to single database:', env.FIREBASE_DATABASE_ID);
    return initializeFirestore(app, {
      experimentalForceLongPolling: isWebOrIframe,
    }, env.FIREBASE_DATABASE_ID);
  } catch (err) {
    console.warn('Firestore initialize fallback to getFirestore:', err);
    try {
      return getFirestore(app, env.FIREBASE_DATABASE_ID);
    } catch {
      return getFirestore(app);
    }
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

export async function loginWithEmail(email: string, pass: string) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
    return cred.user;
  } catch (error) {
    console.error('Email sign-in error:', error);
    throw error;
  }
}

export async function registerWithEmail(email: string, pass: string, name?: string) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
    if (name && cred.user) {
      await updateProfile(cred.user, { displayName: name.trim() });
    }
    return cred.user;
  } catch (error) {
    console.error('Email registration error:', error);
    throw error;
  }
}

export async function resetPasswordEmail(email: string) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return true;
  } catch (error) {
    console.error('Password reset email error:', error);
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
