/**
 * Firebase Cloud Messaging (FCM) initialization.
 *
 * Initializes the Firebase app and messaging instances using environment
 * variables for the Firebase config. The VAPID key is hardcoded as specified
 * in the project requirements.
 *
 * Exports:
 *   - `messaging` — the Firebase Messaging instance (or null if not configured)
 *   - `VAPID_KEY` — the public VAPID key for push subscription
 *   - `isFirebaseConfigured` — whether all required env vars are present
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, isSupported as isMessagingSupported, getToken } from 'firebase/messaging';

// ── VAPID key (hardcoded per spec) ───────────────────────────────────────────
export const VAPID_KEY =
  'BNv1v_I9NMEw24VqZSN9rrP7JktDAfdUqpwdol-aqn76qF0LEB5yZoctfnNT3g7GjWymX1irPXqDXlKZuO82A0U';

// ── Firebase config from environment variables ────────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/**
 * True when all required Firebase env vars are present.
 * Used to guard FCM operations so they no-op in environments
 * where Firebase hasn't been set up yet.
 */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.appId
);

// ── Firebase app singleton ───────────────────────────────────────────────────
let app: ReturnType<typeof initializeApp> | null = null;
let messaging: ReturnType<typeof getMessaging> | null = null;

if (isFirebaseConfigured) {
  // getApps() returns [] if no Firebase app has been initialized yet.
  // We reuse an existing app to avoid duplicate-initialization errors
  // (e.g. in HMR / strict-mode double-render scenarios).
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  // `getMessaging()` throws if there's no service worker registered.
  // We lazily check `isMessagingSupported()` and wrap in try/catch
  // so the import never crashes the app on unsupported browsers.
  try {
    // Only create the messaging instance if the browser supports it.
    // isMessagingSupported() returns a Promise<boolean>.
    // We'll resolve it lazily — for now, create the instance synchronously
    // and handle errors at the call sites (requestFcmToken, onMessage, etc.).
    messaging = getMessaging(app);
  } catch (err) {
    console.warn('[firebase] Failed to initialize Firebase Messaging:', err);
    messaging = null;
  }
}

export { messaging };

/**
 * Helper: check if Firebase Messaging is available at runtime.
 * Resolves to true only if Firebase is configured AND the browser
 * supports push messaging (service worker + Push API).
 */
export async function isFcmAvailable(): Promise<boolean> {
  if (!isFirebaseConfigured || !messaging) return false;
  try {
    const supported = await isMessagingSupported();
    return supported;
  } catch {
    return false;
  }
}

/**
 * Re-export `getToken` for convenience so that fcmService.ts doesn't
 * need to import from 'firebase/messaging' directly.
 *
 * Note: `onTokenRefresh` was removed in newer Firebase SDK versions.
 * Token rotation is now handled by calling `getToken()` periodically
 * and comparing with the cached value. If the token changes, update
 * it in the database.
 */
export { getToken as getFcmToken };
