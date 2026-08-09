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
 * Get the active service worker registration.
 * Caches it after first successful lookup so subsequent calls are synchronous.
 */
async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration) {
    // Verify the registration is still active
    if (swRegistration.active) return swRegistration;
    swRegistration = null; // stale — re-acquire
  }

  if (!('serviceWorker' in navigator)) return null;

  try {
    // navigator.serviceWorker.ready resolves immediately if a SW is already
    // controlling the page, or waits until one is activated.
    swRegistration = await navigator.serviceWorker.ready;
    return swRegistration;
  } catch (err) {
    console.warn('[fcmService] Could not get SW registration:', err);
    return null;
  }
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

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    console.warn('[fcmService] Firebase Messaging not supported in this browser');
    return null;
  }

  try {
    // CRITICAL: Pass the explicit serviceWorkerRegistration so that Firebase
    // binds the FCM token to our combined SW (sw.js), not a default SW.
    // Without this, the PushSubscription doesn't persist when the PWA closes.
    const registration = await getSwRegistration();
    if (!registration) {
      console.warn('[fcmService] No SW registration available — cannot get FCM token');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) {
      console.warn('[fcmService] FCM getToken returned empty token');
      return null;
    }

    // Save/upsert the token to Supabase
    await saveTokenToSupabase(companyId, token);
    console.log('[fcmService] FCM token registered and saved for company:', companyId);
    return token;
  } catch (err) {
    console.error('[fcmService] Failed to get FCM token:', err);
    return null;
  }
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
    console.error('[fcmService] Error saving FCM token:', error.message);
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
