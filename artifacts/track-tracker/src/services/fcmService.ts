/**
 * FCM Service — Firebase Cloud Messaging token management for TrackTracker
 *
 * Responsibilities:
 * - Request notification permission
 * - Get/register FCM token bound to the actual PWA Service Worker
 * - Save token to Supabase `fcm_tokens` table (linked to company)
 * - Remove token when notifications are disabled
 * - Handle token refresh
 * - Expose registration status for UI diagnostics
 */
import { getFirebaseMessaging, isFirebaseConfigured, VAPID_KEY } from '@/lib/firebaseConfig';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getToken, deleteToken } from 'firebase/messaging';

// ── Registration Status (for UI diagnostics) ──────────────────────────────────
export type FcmRegStatus =
  | 'idle'           // not attempted yet
  | 'requesting'     // token registration in progress
  | 'registered'     // token obtained and saved to DB
  | 'failed'         // all attempts failed
  | 'unregistered';   // token removed (notifications off)

let regStatus: FcmRegStatus = 'idle';
let regError: string = '';
type StatusListener = (status: FcmRegStatus, error: string) => void;
let statusListener: StatusListener | null = null;

/**
 * Subscribe to FCM registration status changes.
 * Used by UI to show diagnostic info without DevTools.
 */
export function onFcmStatusChange(listener: StatusListener) {
  statusListener = listener;
  // Immediately emit current state
  listener(regStatus, regError);
}

function setStatus(status: FcmRegStatus, error = '') {
  regStatus = status;
  regError = error;
  statusListener?.(status, error);
}

/** Get current registration status (synchronous, for polling). */
export function getFcmRegStatus(): { status: FcmRegStatus; error: string } {
  return { status: regStatus, error: regError };
}

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
    if (swRegistration.active) return swRegistration;
    swRegistration = null;
  }

  if (!('serviceWorker' in navigator)) return null;

  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 10_000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), TIMEOUT_MS)
        ),
      ]);

      if (registration && registration.active) {
        swRegistration = registration;
        return swRegistration;
      }
    } catch (err) {
      console.warn(`[fcmService] SW registration attempt ${attempt} failed:`, err);
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

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
 *
 * ARCHITECTURE (per Firebase official docs):
 * 1. Wait for the actual PWA Service Worker registration
 * 2. Pass that registration to getToken(messaging, { vapidKey, serviceWorkerRegistration })
 * 3. This binds the FCM push subscription to our combined SW (sw.js)
 * 4. Without serviceWorkerRegistration, Firebase tries /firebase-messaging-sw.js
 *    which does NOT exist in this project → token never works when PWA is closed
 *
 * @param companyId - The UUID of the company from the companies table
 * @returns The FCM token string, or null if unavailable
 */
export async function registerFcmToken(companyId: string): Promise<string | null> {
  if (!isFirebaseConfigured) {
    setStatus('failed', 'Firebase not configured');
    return null;
  }

  if (!isSupabaseConfigured) {
    setStatus('failed', 'Supabase not configured');
    return null;
  }

  const permission = getNotificationPermission();
  if (permission !== 'granted') {
    setStatus('failed', `Notification permission: ${permission}`);
    return null;
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    setStatus('failed', 'Firebase Messaging not supported');
    return null;
  }

  setStatus('requesting');

  // Retry getToken() up to 3 times — the SW might not be ready on first call
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // STEP 1: Get the active PWA Service Worker registration
      const registration = await getSwRegistration();
      if (!registration) {
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        setStatus('failed', 'Service Worker not ready after retries');
        return null;
      }

      // STEP 2: Clean any stale push subscription from a previous SW config
      await cleanStalePushSubscription(registration);

      // STEP 3: Get FCM token bound to our actual SW
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        setStatus('failed', 'getToken() returned empty');
        return null;
      }

      // STEP 4: Upsert token to Supabase
      await saveTokenToSupabase(companyId, token);

      // STEP 5: Verify the token is actually in the database
      const verified = await verifyTokenInDb(companyId, token);
      if (!verified) {
        setStatus('failed', 'Token saved but not found in DB');
        return null;
      }

      setStatus('registered');
      return token;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errCode = (err as { code?: string })?.code ?? '';

      // Permission errors are not retryable
      if (errCode === 'messaging/permission-blocked' || errMsg.includes('permission')) {
        setStatus('failed', `Permission error: ${errMsg}`);
        return null;
      }

      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, attempt * 3000));
      } else {
        setStatus('failed', `${errCode || 'Error'}: ${errMsg}`);
      }
    }
  }

  return null;
}

/**
 * Remove the FCM token from both Firebase and Supabase.
 * Called when the company owner disables notifications.
 */
export async function unregisterFcmToken(companyId: string): Promise<void> {
  if (!isFirebaseConfigured) return;

  setStatus('unregistered');

  const messaging = await getFirebaseMessaging();
  if (!messaging) return;

  try {
    await deleteToken(messaging);
  } catch {
    // Token may already be deleted — that's fine
  }

  // Remove from Supabase
  await removeTokenFromSupabase(companyId);
  // Clear cached SW registration so re-enable gets fresh state
  swRegistration = null;
}

/**
 * Re-register FCM token if needed (called on visibility change).
 * In the modular Firebase SDK (v9+), there's no onTokenRefresh callback.
 */
export async function refreshFcmTokenIfNeeded(companyId: string): Promise<void> {
  if (!isFirebaseConfigured || !isSupabaseConfigured) return;
  if (getNotificationPermission() !== 'granted') return;

  const messaging = await getFirebaseMessaging();
  if (!messaging) return;

  try {
    const registration = await getSwRegistration();
    if (!registration) return;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) {
      await saveTokenToSupabase(companyId, token);
      setStatus('registered');
    }
  } catch {
    // Non-critical — will retry on next visibility change
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
    if (!subscription) return;

    const subKey = subscription.options?.applicationServerKey;
    if (subKey) {
      const subKeyB64 = arrayBufferToBase64(
        subKey instanceof ArrayBuffer
          ? subKey
          : new TextEncoder().encode(subKey as string).buffer as ArrayBuffer,
      );
      const vapidB64 = arrayBufferToBase64(base64UrlToArrayBuffer(VAPID_KEY));

      if (subKeyB64 !== vapidB64) {
        await subscription.unsubscribe();
      }
    }
  } catch {
    // Best effort
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
  // Delete any existing tokens for this company that differ
  const { error: deleteError } = await supabase
    .from('fcm_tokens')
    .delete()
    .eq('company_id', companyId)
    .neq('token', token);

  if (deleteError) {
    console.error('[fcmService] Error cleaning old tokens:', deleteError.message);
  }

  // Insert the new token
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
 * Verify that the token actually exists in the database.
 * This catches RLS/permission issues that would silently fail.
 */
async function verifyTokenInDb(companyId: string, token: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('fcm_tokens')
    .select('token')
    .eq('company_id', companyId)
    .eq('token', token)
    .limit(1);

  if (error || !data || data.length === 0) {
    console.error('[fcmService] Token verification failed:', error?.message || 'token not found');
    return false;
  }
  return true;
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
 * 2. Sends an FCM Web Push with sale data (data-only, no notification key)
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
    if (!accessToken) return;

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
      console.error('[fcmService] notify-sale error:', response.status, errorText);
    }
  } catch (err) {
    console.error('[fcmService] Failed to call notify-sale:', err);
  }
}
