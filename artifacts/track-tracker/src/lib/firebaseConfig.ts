/**
 * Firebase Configuration for TrackTracker
 *
 * All values come from environment variables set in .env / Vercel.
 * The Firebase project is track-tracker-ca74a.
 */
import { initializeApp } from 'firebase/app';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

/** Firebase VAPID key for Web Push */
export const VAPID_KEY =
  import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  'BNv1v_I9NMEw24VqZSN9rrP7JktDAfdUqpwdol-aqn76qF0LEB5yZoctfnNT3g7GjWymX1irPXqDXlKZuO82A0U';

/** Whether Firebase config is fully provided */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
);

/** Initialized Firebase app (singleton) */
let app: ReturnType<typeof initializeApp> | null = null;
let messaging: ReturnType<typeof getMessaging> | null = null;

export function getFirebaseApp() {
  if (!app && isFirebaseConfigured) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export async function getFirebaseMessaging() {
  if (!messaging && isFirebaseConfigured) {
    const supported = await isSupported();
    if (supported) {
      const firebaseApp = getFirebaseApp();
      if (firebaseApp) {
        messaging = getMessaging(firebaseApp);
      }
    }
  }
  return messaging;
}
