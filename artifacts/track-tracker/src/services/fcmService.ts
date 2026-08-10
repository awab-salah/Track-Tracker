/**
 * FCM Service — Firebase Cloud Messaging token management for TrackTracker
 *
 * Responsibilities:
 * - Request notification permission
 * - Get/register FCM token bound to the actual PWA Service Worker
 * - Save token to Supabase `fcm_tokens` table (linked to company)
 * - Remove token when notifications are disabled
 * - Handle token refresh
 * - Expose FULL diagnostics state for visible UI panel (no DevTools needed)
 * - Send test notifications for end-to-end verification
 */
import { getFirebaseMessaging, isFirebaseConfigured, VAPID_KEY } from '@/lib/firebaseConfig';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getToken, deleteToken } from 'firebase/messaging';

// ── Diagnostics State ─────────────────────────────────────────────────────────
// Every step of the FCM registration pipeline is tracked so the UI can show
// exactly what's working and what's broken — no DevTools needed.

export interface FcmDiagnostics {
  /** Browser Notification.permission */
  browserPermission: NotificationPermission | 'unsupported';
  /** Service Worker: 'registered' | 'activated' | 'missing' | 'unsupported' */
  swStatus: 'registered' | 'activated' | 'missing' | 'unsupported';
  /** PushSubscription: 'created' | 'missing' | 'unsupported' */
  pushSubscription: 'created' | 'missing' | 'unsupported';
  /** FCM token from getToken(): 'registered' | 'missing' */
  fcmToken: 'registered' | 'missing';
  /** Token in fcm_tokens DB: 'saved' | 'missing' | 'error' */
  dbToken: 'saved' | 'missing' | 'error';
  /** Human-readable last error */
  lastError: string;
  /** ISO timestamp of last successful registration */
  lastSuccessTime: string;
  /** High-level registration status */
  regStatus: 'idle' | 'requesting' | 'registered' | 'failed' | 'unregistered';
  /** The actual FCM token string (for diagnostics, truncated) */
  tokenPreview: string;
}

const EMPTY_DIAGNOSTICS: FcmDiagnostics = {
  browserPermission: 'unsupported',
  swStatus: 'unsupported',
  pushSubscription: 'unsupported',
  fcmToken: 'missing',
  dbToken: 'missing',
  lastError: '',
  lastSuccessTime: '',
  regStatus: 'idle',
  tokenPreview: '',
};

let diagnostics: FcmDiagnostics = { ...EMPTY_DIAGNOSTICS };
type DiagnosticsListener = (d: FcmDiagnostics) => void;
let diagnosticsListener: DiagnosticsListener | null = null;

/** Subscribe to diagnostics changes (called by UI on mount). */
export function onFcmDiagnosticsChange(listener: DiagnosticsListener) {
  diagnosticsListener = listener;
  listener(diagnostics);
}

/** Get current diagnostics (synchronous, for polling). */
export function getFcmDiagnostics(): FcmDiagnostics {
  return { ...diagnostics };
}

function updateDiagnostics(patch: Partial<FcmDiagnostics>) {
  diagnostics = { ...diagnostics, ...patch };
  diagnosticsListener?.(diagnostics);
}

// Keep backward compat with old getFcmRegStatus
export type FcmRegStatus = FcmDiagnostics['regStatus'];
export function getFcmRegStatus(): { status: FcmRegStatus; error: string } {
  return { status: diagnostics.regStatus, error: diagnostics.lastError };
}

// ── Service Worker Registration ────────────────────────────────────────────────
let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Get the active service worker registration with timeout and retry.
 * Updates diagnostics.swStatus at each step.
 */
async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    updateDiagnostics({ swStatus: 'unsupported' });
    return null;
  }

  if (swRegistration) {
    if (swRegistration.active) {
      updateDiagnostics({ swStatus: 'activated' });
      return swRegistration;
    }
    swRegistration = null;
  }

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
        updateDiagnostics({ swStatus: 'activated' });
        return swRegistration;
      }

      // SW registered but not yet active
      if (registration) {
        updateDiagnostics({ swStatus: 'registered' });
      }
    } catch (err) {
      updateDiagnostics({
        swStatus: 'missing',
        lastError: `SW registration attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  updateDiagnostics({ swStatus: 'missing' });
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

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    updateDiagnostics({ browserPermission: 'unsupported' });
    return 'unsupported';
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  updateDiagnostics({ browserPermission: permission });
  return permission;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  const p = Notification.permission;
  updateDiagnostics({ browserPermission: p });
  return p;
}

// ── Refresh Diagnostics ──────────────────────────────────────────────────────
/**
 * Probe the browser's current state and update diagnostics.
 * Call this on mount and periodically.
 */
export async function refreshFcmDiagnostics(): Promise<FcmDiagnostics> {
  // Browser permission
  const perm = typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission
    : 'unsupported' as const;
  const patch: Partial<FcmDiagnostics> = { browserPermission: perm };

  // Service Worker status
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active) {
        patch.swStatus = 'activated';
      } else if (reg) {
        patch.swStatus = 'registered';
      } else {
        patch.swStatus = 'missing';
      }

      // Push subscription
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        patch.pushSubscription = sub ? 'created' : 'missing';
      } else {
        patch.pushSubscription = 'missing';
      }
    } catch {
      patch.swStatus = 'missing';
      patch.pushSubscription = 'unsupported';
    }
  } else {
    patch.swStatus = 'unsupported';
    patch.pushSubscription = 'unsupported';
  }

  // FCM token status — check if getToken returns a token
  if (isFirebaseConfigured && perm === 'granted') {
    try {
      const messaging = await getFirebaseMessaging();
      if (messaging && swRegistration) {
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swRegistration,
        });
        if (token) {
          patch.fcmToken = 'registered';
          patch.tokenPreview = token.substring(0, 20) + '...';
        } else {
          patch.fcmToken = 'missing';
          patch.tokenPreview = '';
        }
      }
    } catch {
      patch.fcmToken = 'missing';
    }
  }

  updateDiagnostics(patch);
  return diagnostics;
}

// ── Token Management ──────────────────────────────────────────────────────────

/**
 * Get an FCM registration token and save it to Supabase for the given company.
 *
 * Each step updates diagnostics so the UI shows exactly what's happening.
 * If ANY step fails, the function returns null and diagnostics.lastError
 * contains the exact failure reason.
 *
 * @param companyId - The UUID of the company from the companies table
 * @returns The FCM token string, or null if unavailable
 */
export async function registerFcmToken(companyId: string): Promise<string | null> {
  updateDiagnostics({ regStatus: 'requesting', lastError: '' });

  // STEP 0: Check Firebase config
  if (!isFirebaseConfigured) {
    updateDiagnostics({ regStatus: 'failed', lastError: 'Firebase not configured — check env vars' });
    return null;
  }

  // STEP 1: Check Supabase config
  if (!isSupabaseConfigured) {
    updateDiagnostics({ regStatus: 'failed', lastError: 'Supabase not configured — check env vars' });
    return null;
  }

  // STEP 2: Check notification permission
  const permission = getNotificationPermission();
  if (permission !== 'granted') {
    updateDiagnostics({
      regStatus: 'failed',
      lastError: `Browser notification permission: ${permission}. Grant permission and try again.`,
      browserPermission: permission,
    });
    return null;
  }

  // STEP 3: Get Firebase Messaging instance
  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    updateDiagnostics({ regStatus: 'failed', lastError: 'Firebase Messaging not supported in this browser' });
    return null;
  }

  // Retry getToken() up to 3 times
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // STEP 4: Get the active PWA Service Worker registration
      const registration = await getSwRegistration();
      if (!registration) {
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        updateDiagnostics({
          regStatus: 'failed',
          lastError: 'Service Worker not ready after retries. Try refreshing the page.',
        });
        return null;
      }

      // STEP 4b: Verify pushManager exists
      if (!registration.pushManager) {
        updateDiagnostics({
          regStatus: 'failed',
          lastError: 'PushManager not available on this Service Worker registration.',
          pushSubscription: 'unsupported',
        });
        return null;
      }

      // STEP 5: Clean any stale push subscription
      await cleanStalePushSubscription(registration);

      // STEP 6: Get FCM token bound to our actual SW
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        updateDiagnostics({
          regStatus: 'failed',
          lastError: 'getToken() returned empty. Push subscription may be invalid.',
          fcmToken: 'missing',
        });
        return null;
      }

      // Token obtained!
      updateDiagnostics({
        fcmToken: 'registered',
        tokenPreview: token.substring(0, 20) + '...',
      });

      // STEP 7: Check push subscription exists
      const sub = await registration.pushManager.getSubscription();
      updateDiagnostics({ pushSubscription: sub ? 'created' : 'missing' });

      // STEP 8: Save token to Supabase
      const saveResult = await saveTokenToSupabase(companyId, token);
      if (!saveResult) {
        updateDiagnostics({
          regStatus: 'failed',
          lastError: `Failed to save FCM token to database. This is likely an RLS (Row Level Security) issue — the fcm_tokens table may not allow INSERT for the anon key. Error: ${diagnostics.lastError}`,
          dbToken: 'error',
        });
        return null;
      }

      // STEP 9: Verify the token is actually in the database
      const verified = await verifyTokenInDb(companyId, token);
      if (!verified) {
        updateDiagnostics({
          regStatus: 'failed',
          lastError: 'Token was saved but could not be verified in database. RLS may be blocking SELECT.',
          dbToken: 'error',
        });
        return null;
      }

      // SUCCESS!
      updateDiagnostics({
        regStatus: 'registered',
        dbToken: 'saved',
        lastError: '',
        lastSuccessTime: new Date().toISOString(),
      });

      return token;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errCode = (err as { code?: string })?.code ?? '';

      // Permission errors are not retryable
      if (errCode === 'messaging/permission-blocked' || errMsg.includes('permission')) {
        updateDiagnostics({
          regStatus: 'failed',
          lastError: `Permission error: ${errMsg}`,
        });
        return null;
      }

      if (attempt < MAX_ATTEMPTS) {
        updateDiagnostics({ lastError: `Attempt ${attempt} failed (${errCode}): ${errMsg}. Retrying...` });
        await new Promise((r) => setTimeout(r, attempt * 3000));
      } else {
        updateDiagnostics({
          regStatus: 'failed',
          lastError: `${errCode || 'Error'}: ${errMsg}`,
        });
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
  updateDiagnostics({ regStatus: 'unregistered' });

  if (!isFirebaseConfigured) return;

  const messaging = await getFirebaseMessaging();
  if (!messaging) return;

  try {
    await deleteToken(messaging);
  } catch {
    // Token may already be deleted
  }

  await removeTokenFromSupabase(companyId);
  swRegistration = null;

  updateDiagnostics({
    fcmToken: 'missing',
    dbToken: 'missing',
    tokenPreview: '',
    pushSubscription: 'missing',
  });
}

/**
 * Re-register FCM token if needed (called on visibility change).
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
      const saved = await saveTokenToSupabase(companyId, token);
      if (saved) {
        updateDiagnostics({
          regStatus: 'registered',
          fcmToken: 'registered',
          dbToken: 'saved',
          tokenPreview: token.substring(0, 20) + '...',
          lastSuccessTime: new Date().toISOString(),
        });
      }
    }
  } catch {
    // Non-critical — will retry on next visibility change
  }
}

// ── Push Subscription Cleanup ─────────────────────────────────────────────────

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
        updateDiagnostics({ lastError: 'Cleaned stale push subscription with mismatched VAPID key' });
      }
    }
  } catch (err) {
    updateDiagnostics({ lastError: `Stale push cleanup error: ${err instanceof Error ? err.message : String(err)}` });
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
 * Returns true on success, false on failure.
 * CRITICAL: Errors are NOT swallowed — they're surfaced in diagnostics.
 */
async function saveTokenToSupabase(companyId: string, token: string): Promise<boolean> {
  // Delete any existing tokens for this company that differ
  const { error: deleteError } = await supabase
    .from('fcm_tokens')
    .delete()
    .eq('company_id', companyId)
    .neq('token', token);

  if (deleteError) {
    updateDiagnostics({
      dbToken: 'error',
      lastError: `DB delete error (old tokens): ${deleteError.message} (code: ${deleteError.code}, hint: ${deleteError.hint || 'none'})`,
    });
    // Don't return false here — the delete of old tokens is best-effort
  }

  // Insert the new token
  const { error } = await supabase
    .from('fcm_tokens')
    .upsert(
      { company_id: companyId, token },
      { onConflict: 'company_id,token' }
    );

  if (error) {
    updateDiagnostics({
      dbToken: 'error',
      lastError: `DB upsert error: ${error.message} (code: ${error.code}, details: ${error.details || 'none'}, hint: ${error.hint || 'none'})`,
    });
    return false;
  }

  return true;
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

  if (error) {
    updateDiagnostics({
      dbToken: 'error',
      lastError: `DB verify SELECT error: ${error.message} (code: ${error.code}, hint: ${error.hint || 'none'})`,
    });
    return false;
  }

  if (!data || data.length === 0) {
    updateDiagnostics({
      dbToken: 'missing',
      lastError: 'Token upsert succeeded but SELECT found no rows — RLS may block SELECT or INSERT silently failed',
    });
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
    updateDiagnostics({
      dbToken: 'error',
      lastError: `DB delete error: ${error.message} (code: ${error.code})`,
    });
  }
}

// ── Check DB Token Status ─────────────────────────────────────────────────────

/**
 * Check if a token exists in the database for a given company.
 * Updates diagnostics.dbToken accordingly.
 */
export async function checkDbTokenStatus(companyId: string): Promise<'saved' | 'missing' | 'error'> {
  if (!isSupabaseConfigured) {
    updateDiagnostics({ dbToken: 'error' });
    return 'error';
  }

  const { data, error } = await supabase
    .from('fcm_tokens')
    .select('token')
    .eq('company_id', companyId)
    .limit(1);

  if (error) {
    updateDiagnostics({ dbToken: 'error', lastError: `DB check error: ${error.message} (code: ${error.code})` });
    return 'error';
  }

  const status = data && data.length > 0 ? 'saved' : 'missing';
  updateDiagnostics({ dbToken: status });
  return status;
}

// ── Edge Function Call ────────────────────────────────────────────────────────

/** Supabase project URL used to construct Edge Function endpoint. */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ||
  'https://qexafenusvjkyzfhtpda.supabase.co';

/** Supabase anon key — publishable, required for Edge Function auth. */
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';

/**
 * Call the Supabase Edge Function `notify-sale` using an explicit fetch().
 *
 * We use raw `fetch()` (not `supabase.functions.invoke()`) because:
 * - `supabase.functions.invoke()` wraps the response in a way that can
 *   throw `FunctionsFetchError` / "Failed to send a request to the Edge Function"
 *   even when the Edge Function is reachable and working.
 * - Raw `fetch()` gives us direct control over the exact HTTP status code,
 *   response body, and error semantics — no hidden wrapping.
 *
 * Three headers are required:
 *   1. `apikey`          — Supabase anon key (publishable)
 *   2. `Authorization`   — Bearer <user JWT> from the current session
 *   3. `Content-Type`    — application/json
 */
async function callEdgeFunction(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  body: string;
  data: Record<string, unknown> | null;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No authenticated session — please log in again');
  }

  const url = `${SUPABASE_URL}/functions/v1/notify-sale`;

  console.log('[fcmService] Edge Function request:', url, payload);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  console.log('[fcmService] Edge Function response:', response.status, bodyText);

  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(bodyText);
  } catch {
    // Non-JSON response — that's OK, bodyText still has it
  }

  return { ok: response.ok, status: response.status, body: bodyText, data };
}

/**
 * Notify the company owner about a new sale via the Supabase Edge Function.
 * Fire-and-forget: logs errors but does not throw.
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
    const result = await callEdgeFunction({
      saleId,
      driverId,
      driverName,
      totalPrice,
      companyId,
      type: 'sale',
    });

    if (!result.ok) {
      console.error(
        `[fcmService] notify-sale failed: HTTP ${result.status} — ${result.body}`
      );
    }
  } catch (err) {
    console.error('[fcmService] notify-sale exception:', err);
  }
}

// ── Test Notification ─────────────────────────────────────────────────────────

/**
 * Send a test FCM notification to THIS device through the production backend.
 * This calls the same Edge Function used for real sale notifications,
 * but with a synthetic "test" sale ID.
 *
 * Returns { success, message } for UI display.
 */
export async function sendTestNotification(companyId: string): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured) {
    return { success: false, message: 'Supabase not configured' };
  }

  try {
    // Check if there's a token in the DB first
    const dbStatus = await checkDbTokenStatus(companyId);
    if (dbStatus === 'missing') {
      return { success: false, message: 'No FCM token in database. Enable notifications first, then try again.' };
    }
    if (dbStatus === 'error') {
      return { success: false, message: `Database error: ${diagnostics.lastError}` };
    }

    const testSaleId = `test-${Date.now()}`;

    const result = await callEdgeFunction({
      saleId: testSaleId,
      driverId: 'test-driver',
      driverName: 'اختبار',
      totalPrice: 1000,
      companyId,
      type: 'sale',
    });

    // HTTP-level failure
    if (!result.ok) {
      return {
        success: false,
        message: `Edge Function HTTP ${result.status}: ${result.body.substring(0, 200)}`,
      };
    }

    // Parse the response
    const r = result.data;

    if (r?.message && String(r.message).includes('No FCM tokens')) {
      return { success: false, message: 'No FCM tokens registered for this company. Enable notifications first.' };
    }

    if (r?.error) {
      return { success: false, message: `Server error: ${r.error}` };
    }

    if (r?.sent && (r.sent as number) > 0) {
      return { success: true, message: `Test notification sent! (${r.sent}/${r.total} devices). Check your notification tray.` };
    }

    if (r?.sent === 0) {
      return { success: false, message: 'Edge Function returned sent=0. No FCM tokens found for this company.' };
    }

    return { success: true, message: `Edge Function responded (HTTP ${result.status}): ${result.body.substring(0, 200)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Request failed: ${msg}` };
  }
}
