/**
 * Firebase initialization for Web Push (FCM).
 *
 * Env vars (all prefixed VITE_ so Vite injects them):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *
 * If any are missing the module stays inert — callers check isFirebaseConfigured().
 */

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getMessaging, isSupported as isMessagingSupported, onMessage, type MessagePayload } from 'firebase/messaging';

// ── Config from env ──────────────────────────────────────────────────────────

const FIREBASE_CONFIG = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string | undefined,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN       as string | undefined,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID        as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID            as string | undefined,
};

/** VAPID public key — hard-coded (not secret). */
export const FCM_VAPID_KEY =
  'BNv1v_I9NMEw24VqZSN9rrP7JktDAfdUqpwdol-aqn76qF0LEB5yZoctfnNT3g7GjWymX1irPXqDXlKZuO82A0U';

// ── Guards ───────────────────────────────────────────────────────────────────

/** True when all required Firebase env vars are present. */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.authDomain &&
    FIREBASE_CONFIG.projectId &&
    FIREBASE_CONFIG.messagingSenderId &&
    FIREBASE_CONFIG.appId
  );
}

/** True when FCM is available (Firebase configured + browser supports Push). */
export async function isFcmAvailable(): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  return isMessagingSupported();
}

// ── Init ─────────────────────────────────────────────────────────────────────

let _messaging: ReturnType<typeof getMessaging> | null = null;

function getAppInstance() {
  if (getApps().length > 0) return getApp();
  return initializeApp({
    apiKey:            FIREBASE_CONFIG.apiKey!,
    authDomain:        FIREBASE_CONFIG.authDomain!,
    projectId:         FIREBASE_CONFIG.projectId!,
    messagingSenderId: FIREBASE_CONFIG.messagingSenderId!,
    appId:             FIREBASE_CONFIG.appId!,
  });
}

/**
 * Returns the Firebase Messaging instance (or null if unavailable).
 * Safe to call multiple times — singleton.
 */
export async function getFcmMessaging() {
  if (_messaging) return _messaging;
  if (!(await isFcmAvailable())) return null;
  const app = getAppInstance();
  _messaging = getMessaging(app);
  return _messaging;
}

/**
 * Register a foreground message handler.
 * This fires when the page is in the foreground and a push message arrives.
 * Returns an unsubscribe function, or null if FCM is unavailable.
 */
export async function registerFcmForegroundHandler(
  handler: (payload: MessagePayload) => void
): Promise<(() => void) | null> {
  const messaging = await getFcmMessaging();
  if (!messaging) return null;
  return onMessage(messaging, handler);
}
