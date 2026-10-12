import firebaseAppletConfig from '../../firebase-applet-config.json';

/**
 * Unified Environment Variable Resolution
 * Reads environment variables from import.meta.env (Vite), process.env (Node/CI),
 * or falls back to firebase-applet-config.json / safe defaults.
 */

const getEnvVar = (viteKey: string, processKey: string, fallback: string = ''): string => {
  // 1. Check Vite import.meta.env
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[viteKey]) {
      const val = import.meta.env[viteKey];
      if (typeof val === 'string' && val.trim() !== '') {
        return val.trim();
      }
    }
  } catch {
    // Ignore meta reference errors in non-ESM runtimes
  }

  // 2. Check process.env (Node / CI / SSR)
  try {
    if (typeof process !== 'undefined' && process.env) {
      const val = process.env[viteKey] || process.env[processKey];
      if (typeof val === 'string' && val.trim() !== '') {
        return val.trim();
      }
    }
  } catch {
    // Ignore process reference errors in browser runtimes
  }

  // 3. Fallback to provided default
  return fallback;
};

export const env = {
  // Firebase Credentials
  // When firebaseAppletConfig provides a valid provisioned database or keys, prefer them over generic defaults
  FIREBASE_API_KEY: (firebaseAppletConfig.apiKey && firebaseAppletConfig.apiKey !== 'dummy-firebase-api-key')
    ? firebaseAppletConfig.apiKey
    : getEnvVar('VITE_FIREBASE_API_KEY', 'FIREBASE_API_KEY', 'AIzaSyAdDFuGh_GAuvH-MSG9o3obLvGmFQ6aDR4'),
  FIREBASE_PROJECT_ID: firebaseAppletConfig.projectId || getEnvVar('VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID', 'glossy-topic-380115'),
  FIREBASE_APP_ID: firebaseAppletConfig.appId || getEnvVar('VITE_FIREBASE_APP_ID', 'FIREBASE_APP_ID', '1:556597604247:web:b4fbcda8df3509b1dd9ed2'),
  FIREBASE_AUTH_DOMAIN: firebaseAppletConfig.authDomain || getEnvVar('VITE_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN', 'glossy-topic-380115.firebaseapp.com'),
  FIREBASE_DATABASE_ID: (() => {
    const configId = firebaseAppletConfig.firestoreDatabaseId;
    if (configId && configId.trim() !== '' && configId !== '(default)') {
      return configId.trim();
    }
    const envVal = getEnvVar('VITE_FIREBASE_DATABASE_ID', 'FIREBASE_DATABASE_ID', '');
    if (envVal && envVal.trim() !== '' && envVal !== '(default)') {
      return envVal.trim();
    }
    return 'ai-studio-bappalocator-3f3c0518-c821-44fe-84bf-aa228b12ee54';
  })(),
  FIREBASE_STORAGE_BUCKET: firebaseAppletConfig.storageBucket || getEnvVar('VITE_FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET', 'glossy-topic-380115.firebasestorage.app'),
  FIREBASE_MESSAGING_SENDER_ID: firebaseAppletConfig.messagingSenderId || getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_MESSAGING_SENDER_ID', '556597604247'),

  // Google Maps Platform Key
  GOOGLE_MAPS_API_KEY: getEnvVar('VITE_GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_API_KEY', ''),

  // Gemini AI Key
  GEMINI_API_KEY: getEnvVar('VITE_GEMINI_API_KEY', 'GEMINI_API_KEY', ''),

  // Application Settings
  APP_URL: getEnvVar('VITE_APP_URL', 'APP_URL', 'https://bappa-locator.app'),
  MODE: getEnvVar('MODE', 'NODE_ENV', 'production'),
  IS_DEV: typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.DEV : false,
  IS_PROD: typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.PROD : true,

  // Feature Flags & Fallbacks Check
  hasValidFirebase: () => {
    return Boolean(env.FIREBASE_API_KEY && env.FIREBASE_API_KEY !== 'dummy-firebase-api-key');
  },
  hasGoogleMapsKey: () => {
    return Boolean(env.GOOGLE_MAPS_API_KEY && env.GOOGLE_MAPS_API_KEY.length > 10);
  },
};

export default env;
