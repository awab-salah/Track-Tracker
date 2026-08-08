/**
 * FCM service — token lifecycle & push-trigger helpers.
 *
 * Token flow:
 *   1. enableNotifications() → requestFcmToken() → Firebase getToken()
 *   2. Token upserted into Supabase `fcm_tokens` (one row per device-browser)
 *   3. disableNotifications() → removeFcmToken() → delete from `fcm_tokens`
 *
 * Push flow (after a sale):
 *   1. addSale() → notifySaleViaEdgeFunction() (fire-and-forget)
 *   2. Edge Function queries `fcm_tokens` for the company → sends FCM HTTP v1 push
 *   3. Service worker shows notification in background; onMessage in foreground
 */

import { getToken, deleteToken } from 'firebase/messaging';
import { getFcmMessaging, isFcmAvailable, FCM_VAPID_KEY } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';

// ── Token persistence ────────────────────────────────────────────────────────

/**
 * Request an FCM registration token from the browser, then persist it
 * to the `fcm_tokens` table so the Edge Function can look it up later.
 *
 * Returns the token string on success, or null on failure.
 */
export async function requestFcmToken(companyId: string): Promise<string | null> {
  try {
    const messaging = await getFcmMessaging();
    if (!messaging) {
      console.warn('[fcmService] FCM messaging not available — skipping token request');
      return null;
    }

    const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY });
    if (!token) {
      console.warn('[fcmService] getToken() returned empty — permission may be denied');
      return null;
    }

    console.info('[fcmService] FCM token obtained:', token.slice(0, 12) + '…');

    // Upsert into Supabase. The unique constraint is (company_id, token),
    // so re-enabling on the same device just updates created_at.
    const { error } = await supabase
      .from('fcm_tokens')
      .upsert(
        { company_id: companyId, token },
        { onConflict: 'company_id,token' }
      );

    if (error) {
      console.error('[fcmService] Failed to persist FCM token:', error.message);
      // Token is still valid locally — return it so foreground works.
      // The edge function just won't be able to push to this device until
      // the DB row is fixed.
    }

    return token;
  } catch (err) {
    console.error('[fcmService] requestFcmToken error:', err);
    return null;
  }
}

/**
 * Remove the current FCM token from both Firebase and Supabase.
 * Called when the user disables notifications.
 */
export async function removeFcmToken(): Promise<void> {
  try {
    const messaging = await getFcmMessaging();
    if (!messaging) return;

    // Get current token to delete from DB
    const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY }).catch(() => null);

    // Delete from Firebase (invalidates the token server-side)
    await deleteToken(messaging).catch(() => {});

    // Delete from Supabase
    if (token) {
      await supabase.from('fcm_tokens').delete().eq('token', token);
    }

    console.info('[fcmService] FCM token removed');
  } catch (err) {
    console.error('[fcmService] removeFcmToken error:', err);
  }
}

// ── Edge Function trigger ────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ||
  'https://qexafenusvjkyzfhtpda.supabase.co';

/**
 * Fire-and-forget call to the Supabase Edge Function `notify-sale`.
 * The Edge Function queries `fcm_tokens` for the company and pushes
 * an FCM message to each registered device.
 *
 * This is called from addSale() and must NEVER block or throw to the caller.
 */
export async function notifySaleViaEdgeFunction(
  driverId: string,
  driverName: string,
  totalPrice: number,
  companyId: string
): Promise<void> {
  try {
    // Use the anon key for authentication (the edge function validates the
    // caller via the authorization header).
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/notify-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ driverId, driverName, totalPrice, companyId }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn(
        `[fcmService] notify-sale edge function returned ${response.status}: ${text}`
      );
    }
  } catch (err) {
    // Fire-and-forget — never throw to the caller.
    console.warn('[fcmService] notify-sale edge function error (non-blocking):', err);
  }
}
