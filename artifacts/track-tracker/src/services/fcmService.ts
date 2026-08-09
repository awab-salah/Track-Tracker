/**
 * FCM Service — Firebase Cloud Messaging token management for TrackTracker
 *
 * Responsibilities:
 * - Request notification permission
 * - Get/register FCM token
 * - Save token to Supabase `fcm_tokens` table (linked to company)
 * - Remove token when notifications are disabled
 * - Handle token refresh
 */
import { getFirebaseMessaging, isFirebaseConfigured, VAPID_KEY } from '@/lib/firebaseConfig';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getToken, deleteToken } from 'firebase/messaging';

// ── Service Worker Registration ────────────────────────────────────────────────
// CRITICAL: Firebase getToken() MUST receive the explicit serviceWorkerRegistration
// for the SW that handles FCM background messages. Without it, Firebase tries to
// register its own default SW at /firebase-messaging-sw.js, which doesn't exist
// in this project (we use a single combined SW via injectManifest). This was the
// root cause of "no notification when PWA completely closed" — the FCM token was
// never bound to the actual SW, so the push subscription didn't persist.
let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Get the active service worker registration with timeout and retry.
 *
 * navigator.serviceWorker.ready resolves when a SW is activated, but:
 * - If the SW registration hasn't started yet, it will wait indefinitely
 * - If the SW fails to install, it will never resolve
 *
 * We add a 10-second timeout and up to 3 retries with increasing delays
 * to handle the race condition where registerFcmToken() is called before
 * the PWA's SW registration completes.
 */
async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration) {
    // Verify the registration is still active
    if (swRegistration.active) return swRegistration;
    console.warn('[fcmService] Cached SW registration lost active worker — re-acquiring');
    swRegistration = null;
  }

  if (!('serviceWorker' in navigator)) {
    console.warn('[fcmService] Service Worker API not available');
    return null;
  }

  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 10_000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[fcmService] Getting SW registration (attempt ${attempt}/${MAX_RETRIES})...`);

      // Race navigator.serviceWorker.ready against a timeout
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) =>
          setTimeout(() => {
            console.warn(`[fcmService] SW registration timed out after ${TIMEOUT_MS}ms`);
            resolve(null);
          }, TIMEOUT_MS)
        ),
      ]);

      if (registration && registration.active) {
        swRegistration = registration;
        console.log('[fcmService] SW registration acquired:', registration.active.scriptURL);
        return swRegistration;
      }

      if (registration) {
        // Registration exists but no active worker yet
        console.warn('[fcmService] SW registration found but no active worker — state:',
          registration.installing ? 'installing' : registration.waiting ? 'waiting' : 'unknown');
      }
    } catch (err) {
      console.warn(`[fcmService] SW registration attempt ${attempt} failed:`, err);
    }

    // Wait before retrying (except on last attempt)
    if (attempt < MAX_RETRIES) {
      const delay = attempt * 2000; // 2s, 4s
      console.log(`[fcmService] Retrying SW registration in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.error('[fcmService] Failed to get SW registration after all retries');
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FcmTokenRecord {
  id: string;
  company_id: string;
  token: string;
  created_at: string;
}

// ── Permission ────────────────────────────────────────────────────────────────

/**
 * Request browser notification permission.
 * Returns the new permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  return permission;
}

/**
 * Get current notification permission without prompting.
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

// ── Token Management ──────────────────────────────────────────────────────────

/**
 * Get an FCM registration token and save it to Supabase for the given company.
 * Called when the company owner enables notifications.
 *
 * Includes retry logic: if the first getToken() call fails (e.g., SW not yet
 * ready), it retries up to 2 more times with a delay.
 *
 * @param companyId - The UUID of the company from the companies table
 * @returns The FCM token string, or null if unavailable
 */
export async function registerFcmToken(companyId: string): Promise<string | null> {
  if (!isFirebaseConfigured) {
    console.warn('[fcmService] Firebase not configured — skipping FCM token registration');
    return null;
  }

  if (!isSupabaseConfigured) {
    console.warn('[fcmService] Supabase not configured — cannot save FCM token');
    return null;
  }

  const permission = getNotificationPermission();
  if (permission !== 'granted') {
    console.warn('[fcmService] Notification permission not granted (current:', permission, ') — cannot register token');
    return null;
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    console.warn('[fcmService] Firebase Messaging not supported in this browser');
    return null;
  }

  // Retry getToken() up to 3 times — the SW might not be ready on first call
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // CRITICAL: Pass the explicit serviceWorkerRegistration so that Firebase
      // binds the FCM token to our combined SW (sw.js), not a default SW.
      // Without this, the PushSubscription doesn't persist when the PWA closes.
      const registration = await getSwRegistration();
      if (!registration) {
        console.warn(`[fcmService] No SW registration available (attempt ${attempt}/${MAX_ATTEMPTS})`);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        return null;
      }

      // Before getToken(), clear any stale push subscription that may have
      // been created by the old code (without serviceWorkerRegistration).
      // A mismatched subscription causes getToken() to fail with
      // "MismatchSenderId" or "Invalid registration".
      await cleanStalePushSubscription(registration);

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
      if (!token) {
        console.warn(`[fcmService] FCM getToken returned empty token (attempt ${attempt}/${MAX_ATTEMPTS})`);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        return null;
      }

      // Save/upsert the token to Supabase
      await saveTokenToSupabase(companyId, token);
      console.log('[fcmService] FCM token registered and saved for company:', companyId, 'token_prefix:', token.substring(0, 20) + '...');
      return token;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errCode = (err as { code?: string })?.code ?? '';
      console.error(`[fcmService] Failed to get FCM token (attempt ${attempt}/${MAX_ATTEMPTS}):`, errCode, errMsg);

      // If the error is a permission error, don't retry
      if (errCode === 'messaging/permission-blocked' || errMsg.includes('permission')) {
        return null;
      }

      if (attempt < MAX_ATTEMPTS) {
        const delay = attempt * 3000; // 3s, 6s
        console.log(`[fcmService] Retrying token registration in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  console.error('[fcmService] Failed to register FCM token after all attempts');
  return null;
}

/**
 * Remove the FCM token from both Firebase and Supabase.
 * Called when the company owner disables notifications.
 *
 * @param companyId - The UUID of the company
 */
export async function unregisterFcmToken(companyId: string): Promise<void> {
  if (!isFirebaseConfigured) return;

  const messaging = await getFirebaseMessaging();
  if (!messaging) return;

  try {
    // Delete the token from the browser/Firebase
    await deleteToken(messaging);
    console.log('[fcmService] FCM token deleted from browser');
  } catch (err) {
    // Token may already be deleted or invalid — that's fine
    console.warn('[fcmService] deleteToken error (may already be removed):', err);
  }

  // Remove from Supabase
  await removeTokenFromSupabase(companyId);
  // Also clear cached SW registration so re-enable gets fresh state
  swRegistration = null;
}

/**
 * Listen for FCM token refresh and update Supabase.
 * In the modular Firebase SDK (v9+), there's no onTokenRefresh callback.
 * Instead, we periodically re-register the token (called on visibility change
 * and on a timer). This also handles the case where the browser updates
 * and the old token becomes invalid.
 */
export async function refreshFcmTokenIfNeeded(companyId: string): Promise<void> {
  if (!isFirebaseConfigured || !isSupabaseConfigured) return;
  if (getNotificationPermission() !== 'granted') return;

  const messaging = await getFirebaseMessaging();
  if (!messaging) return;

  try {
    // Must pass explicit SW registration (same reason as registerFcmToken)
    const registration = await getSwRegistration();
    if (!registration) {
      console.warn('[fcmService] No SW registration — skipping token refresh');
      return;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) {
      await saveTokenToSupabase(companyId, token);
    }
  } catch (err) {
    console.warn('[fcmService] Token refresh error:', err);
  }
}

// ── Push Subscription Cleanup ─────────────────────────────────────────────────

/**
 * Clear any stale push subscription from the service worker registration.
 *
 * When the code previously called getToken() WITHOUT serviceWorkerRegistration,
 * Firebase may have created a push subscription using its own default SW path
 * (/firebase-messaging-sw.js). That subscription is now stale because:
 *   1. The default SW file was removed
 *   2. We now pass the combined SW (sw.js) explicitly
 *
 * A stale subscription with a different applicationServerKey causes
 * getToken() to fail with errors like "MismatchSenderId" or
 * "Invalid registration". By unsubscribing it first, getToken() can
 * create a fresh subscription bound to the correct VAPID key and SW.
 */
async function cleanStalePushSubscription(
  registration: ServiceWorkerRegistration,
): Promise<void> {
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return; // No subscription — clean

    // Check if the subscription's applicationServerKey matches our VAPID key.
    // If they differ, the subscription was created by the old code and is stale.
    const subKey = subscription.options?.applicationServerKey;
    if (subKey) {
      // Convert both to base64 for comparison
      const subKeyB64 = arrayBufferToBase64(
        subKey instanceof ArrayBuffer
          ? subKey
          : new TextEncoder().encode(subKey as string).buffer as ArrayBuffer,
      );
      const vapidB64 = arrayBufferToBase64(
        // VAPID_KEY is a base64url string — decode it
        base64UrlToArrayBuffer(VAPID_KEY),
      );

      if (subKeyB64 !== vapidB64) {
        console.warn('[fcmService] Stale push subscription detected (key mismatch) — unsubscribing');
        await subscription.unsubscribe();
        return;
      }
    }

    // Subscription exists and keys match — keep it
  } catch (err) {
    console.warn('[fcmService] Error checking/cleaning push subscription:', err);
  }
}

/** Convert ArrayBuffer to base64 string for comparison. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Convert base64url string to ArrayBuffer. */
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  // Pad with '=' to make valid base64
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

// ── Supabase Token Persistence ────────────────────────────────────────────────

/**
 * Save or update the FCM token in the `fcm_tokens` table.
 * Uses upsert to handle token refresh (same company, new token).
 * Also removes any old tokens for this company that differ (stale tokens).
 */
async function saveTokenToSupabase(companyId: string, token: string): Promise<void> {
  // First, delete any existing tokens for this company that differ
  // (handles token refresh — old token becomes invalid)
  const { error: deleteError } = await supabase
    .from('fcm_tokens')
    .delete()
    .eq('company_id', companyId)
    .neq('token', token);

  if (deleteError) {
    console.warn('[fcmService] Error cleaning old tokens:', deleteError.message);
  }

  // Insert the new token (or it already exists — that's fine)
  const { error } = await supabase
    .from('fcm_tokens')
    .upsert(
      { company_id: companyId, token },
      { onConflict: 'company_id,token' }
    );

  if (error) {
    console.error('[fcmService] Error saving FCM token:', error.message, '(companyId:', companyId, ')');
  }
}

/**
 * Remove all FCM tokens for a company from Supabase.
 */
async function removeTokenFromSupabase(companyId: string): Promise<void> {
  const { error } = await supabase
    .from('fcm_tokens')
    .delete()
    .eq('company_id', companyId);

  if (error) {
    console.error('[fcmService] Error removing FCM tokens:', error.message);
  }
}

// ── Edge Function Call ────────────────────────────────────────────────────────

/**
 * Notify the company owner about a new sale via the Supabase Edge Function.
 * Called from the driver's app after creating a sale.
 *
 * The Edge Function:
 * 1. Looks up the company owner's FCM token from `fcm_tokens`
 * 2. Sends an FCM Web Push with sale data
 * 3. The service worker on the company device displays the notification
 */
export async function notifySaleViaEdgeFunction(
  saleId: string,
  driverId: string,
  driverName: string,
  totalPrice: number,
  companyId: string
): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      console.warn('[fcmService] No auth token — cannot call notify-sale Edge Function');
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ||
      'https://qexafenusvjkyzfhtpda.supabase.co';

    const response = await fetch(`${supabaseUrl}/functions/v1/notify-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        saleId,
        driverId,
        driverName,
        totalPrice,
        companyId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[fcmService] notify-sale Edge Function error:', response.status, errorText);
    } else {
      console.log('[fcmService] Sale notification sent via Edge Function for sale:', saleId);
    }
  } catch (err) {
    console.error('[fcmService] Failed to call notify-sale Edge Function:', err);
  }
}
