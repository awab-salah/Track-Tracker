/**
 * FCM Service — Client-side Firebase Cloud Messaging token management.
 *
 * Provides functions to:
 *   - Request and persist FCM tokens to the `fcm_tokens` Supabase table
 *   - Remove FCM tokens from the database (on disable/logout)
 *   - Invoke the `notify-sale` Supabase Edge Function to trigger push
 *
 * All functions are guarded by `isFcmAvailable()` and `isSupabaseConfigured`
 * so they gracefully no-op when FCM or Supabase is not set up.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { messaging, VAPID_KEY, isFcmAvailable, getFcmToken } from '@/lib/firebase';

// ── In-memory cache of the current FCM token ─────────────────────────────────
// Avoids redundant DB writes when the token hasn't changed.
let currentFcmToken: string | null = null;

/**
 * Request an FCM push token from the browser and persist it to the
 * `fcm_tokens` table for the given company.
 *
 * Called when the company owner enables notifications (after permission
 * is granted). The token uniquely identifies this browser device for
 * push delivery.
 *
 * @param companyId — the UUID of the company to associate the token with
 * @returns the FCM token string, or null if FCM is unavailable
 */
export async function requestFcmToken(companyId: string): Promise<string | null> {
  const fcmAvailable = await isFcmAvailable();
  if (!fcmAvailable || !messaging || !isSupabaseConfigured || !companyId) {
    console.warn('[fcmService] requestFcmToken skipped:', {
      fcmAvailable,
      hasMessaging: !!messaging,
      isSupabaseConfigured,
      hasCompanyId: !!companyId,
    });
    return null;
  }

  try {
    // Wait for the service worker to be ready before requesting a token.
    // Without this, getToken() may fail because no SW is registered yet
    // (especially on first page load before the PWA SW installs).
    await navigator.serviceWorker.ready;

    const token = await getFcmToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) {
      console.warn('[fcmService] getToken returned empty — push subscription failed.');
      return null;
    }

    console.log('[fcmService] FCM token obtained, persisting to fcm_tokens for company', companyId);

    // Persist to Supabase. Use upsert-like logic: insert if not exists,
    // ignore on conflict (unique constraint on company_id + token).
    const { error } = await supabase
      .from('fcm_tokens')
      .upsert(
        { company_id: companyId, token },
        { onConflict: 'company_id,token' }
      );

    if (error) {
      console.error('[fcmService] Failed to persist FCM token:', error.message);
      // Still return the token — it's valid for foreground messaging even
      // if the DB write failed. The Edge Function just won't find it.
    } else {
      console.log('[fcmService] FCM token persisted to fcm_tokens successfully');
    }

    currentFcmToken = token;

    // Note: `onTokenRefresh` was removed in newer Firebase SDK versions.
    // Token rotation is handled by calling `getToken()` again when needed
    // (e.g. on app focus) and comparing with the cached value. If the
    // token changes, call requestFcmToken again to update the DB.
    // This is handled transparently — the next call to requestFcmToken
    // will upsert the new token.

    return token;
  } catch (err) {
    console.error('[fcmService] requestFcmToken error:', err);
    return null;
  }
}

/**
 * Remove the FCM token for the given company from the database.
 *
 * Called when the company owner disables notifications or on logout.
 * After this, the Edge Function will no longer find a token to push to
 * for this device.
 *
 * @param companyId — the UUID of the company
 */
export async function removeFcmToken(companyId: string): Promise<void> {
  if (!isSupabaseConfigured || !companyId) return;

  // If we have a cached token, delete by exact match for efficiency.
  // Otherwise, delete all tokens for this company (shouldn't happen
  // in practice — there's only one token per browser device per company).
  try {
    if (currentFcmToken) {
      await supabase
        .from('fcm_tokens')
        .delete()
        .eq('company_id', companyId)
        .eq('token', currentFcmToken);
    } else {
      await supabase
        .from('fcm_tokens')
        .delete()
        .eq('company_id', companyId);
    }
  } catch (err) {
    console.error('[fcmService] removeFcmToken error:', err);
  }

  currentFcmToken = null;
}

/**
 * Invoke the `notify-sale` Supabase Edge Function to trigger an FCM
 * push notification to the company owner.
 *
 * This is called by the driver's `addSale` handler after the sale is
 * persisted. It's fire-and-forget — the sale is already saved; the
 * push notification is a best-effort add-on.
 *
 * @param saleId    — the UUID of the sale (used for dedup via notification tag)
 * @param driverId  — the UUID of the driver who made the sale
 * @param driverName — the driver's display name (for the notification body)
 * @param totalPrice — the total sale price in IQD
 * @param companyId — the UUID of the company to notify
 */
export async function notifySaleViaEdgeFunction(
  saleId: string,
  driverId: string,
  driverName: string,
  totalPrice: number,
  companyId: string
): Promise<void> {
  // NOTE: We do NOT check isFcmAvailable() here.
  // The driver's browser doesn't need FCM — only the company owner does.
  // The Edge Function will look up the company's FCM tokens server-side.
  // Checking isFcmAvailable() on the driver's browser would incorrectly
  // block the notification when the driver hasn't granted notification
  // permission (which they don't need to do).
  if (!isSupabaseConfigured || !companyId) {
    console.warn('[fcmService] notify-sale skipped: Supabase not configured or companyId missing');
    return;
  }

  try {
    console.log('[fcmService] Invoking notify-sale Edge Function for company', companyId);
    const { error } = await supabase.functions.invoke('notify-sale', {
      body: { saleId, driverId, driverName, totalPrice, companyId },
    });

    if (error) {
      console.error('[fcmService] notify-sale Edge Function error:', error.message);
    } else {
      console.log('[fcmService] notify-sale Edge Function invoked successfully');
    }
  } catch (err) {
    console.error('[fcmService] notifySaleViaEdgeFunction error:', err);
  }
}

/**
 * Get the cached FCM token (if any). Useful for checking whether
 * FCM is currently registered without making an async call.
 */
export function getCachedFcmToken(): string | null {
  return currentFcmToken;
}
