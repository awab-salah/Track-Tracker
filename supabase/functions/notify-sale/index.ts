/**
 * Supabase Edge Function: notify-sale
 *
 * Called by the driver's app after creating a sale.
 * Looks up the company owner's FCM token from `fcm_tokens` table
 * and sends an FCM Web Push notification.
 *
 * Request body:
 *   { saleId, driverId, driverName, totalPrice, companyId }
 *
 * Environment variables (set in Supabase dashboard):
 *   FIREBASE_PROJECT_ID      — e.g. "track-tracker-ca74a"
 *   FIREBASE_CLIENT_EMAIL   — Firebase service account email
 *   FIREBASE_PRIVATE_KEY    — Firebase service account private key (PKCS8)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Firebase Admin Auth (JWT signing for HTTP v1 API) ────────────────────────

function base64url(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getFirebaseAccessToken(
  projectId: string,
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  // Sign the JWT using the RS256 algorithm
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const keyData = privateKey.replace(/\\n/g, '\n');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    new TextEncoder().encode(keyData),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = base64url(
    String.fromCharCode(...new Uint8Array(signature))
  );

  const jwt = `${unsignedToken}.${signatureB64}`;

  // Exchange JWT for access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const data = await response.json();
  if (!data.access_token) {
    throw new Error(`Failed to get Firebase access token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

// ── Send FCM Message ──────────────────────────────────────────────────────────

async function sendFcmMessage(
  projectId: string,
  accessToken: string,
  token: string,
  saleId: string,
  driverId: string,
  driverName: string,
  totalPrice: number,
  companyId: string
): Promise<void> {
  const pushTitle = 'عملية بيع جديدة';
  const pushBody = `${driverName} سجّل عملية بيع بقيمة ${totalPrice.toLocaleString('ar-IQ')} د.ع`;

  // Data-only message (no `notification` key) — the service worker handles
  // display via onBackgroundMessage, ensuring ONE notification per sale.
  const message = {
    message: {
      token,
      data: {
        saleId,
        driverId,
        companyId,
        type: 'sale',
        title: pushTitle,
        body: pushBody,
        icon: '/icons/icon-192.png',
        clickAction: '/',
      },
      webpush: {
        fcm_options: {
          link: '/',
        },
      },
    },
  };

  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[notify-sale] FCM send failed (${response.status}):`, errorText);

    // If the token is invalid/unregistered, remove it from the DB
    if (response.status === 404 || errorText.includes('NotRegistered') || errorText.includes('invalid-registration-token')) {
      console.log('[notify-sale] Removing invalid FCM token');
      // We'll handle cleanup in the main handler
    }

    throw new Error(`FCM send failed: ${response.status}`);
  }

  console.log('[notify-sale] FCM message sent successfully for sale:', saleId);
}

// ── Main Handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  try {
    const { saleId, driverId, driverName, totalPrice, companyId } = await req.json();

    // Validate required fields
    if (!saleId || !driverId || !companyId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: saleId, driverId, companyId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Firebase config from environment
    const firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID');
    const firebaseClientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL');
    const firebasePrivateKey = Deno.env.get('FIREBASE_PRIVATE_KEY');

    if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
      console.error('[notify-sale] Firebase env vars not configured');
      return new Response(
        JSON.stringify({ error: 'Firebase not configured on server' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Supabase client (service role to read fcm_tokens table)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up FCM tokens for this company
    const { data: tokens, error: tokenError } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('company_id', companyId);

    if (tokenError) {
      console.error('[notify-sale] Error fetching FCM tokens:', tokenError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch FCM tokens' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log('[notify-sale] No FCM tokens found for company:', companyId);
      return new Response(
        JSON.stringify({ message: 'No FCM tokens registered for this company' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get Firebase access token
    const accessToken = await getFirebaseAccessToken(
      firebaseProjectId,
      firebaseClientEmail,
      firebasePrivateKey
    );

    // Send FCM push to ALL tokens for this company
    // (multiple devices may be registered)
    const results = await Promise.allSettled(
      tokens.map(({ token }) =>
        sendFcmMessage(
          firebaseProjectId,
          accessToken,
          token,
          saleId,
          driverId,
          driverName || 'مندوب',
          totalPrice,
          companyId
        )
      )
    );

    // Clean up invalid tokens
    const invalidTokenIndices = results
      .map((r, i) => r.status === 'rejected' ? i : -1)
      .filter((i) => i >= 0);

    if (invalidTokenIndices.length > 0) {
      const invalidTokens = invalidTokenIndices.map((i) => tokens[i].token);
      console.log('[notify-sale] Removing invalid tokens:', invalidTokens);
      await supabase
        .from('fcm_tokens')
        .delete()
        .in('token', invalidTokens);
    }

    const sentCount = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`[notify-sale] Sent ${sentCount}/${tokens.length} notifications for sale ${saleId}`);

    return new Response(
      JSON.stringify({ sent: sentCount, total: tokens.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[notify-sale] Error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
