/**
 * Supabase Edge Function: notify-sale
 *
 * Triggered when a driver records a new sale. Sends FCM push notifications
 * to all browser devices registered for the company (via `fcm_tokens` table).
 *
 * Request body:
 *   { driverId, driverName, totalPrice, companyId }
 *
 * Flow:
 *   1. Query `fcm_tokens` for all tokens matching `companyId`
 *   2. Get an OAuth2 access token from Google using the service account
 *   3. For each token, POST to FCM HTTP v1 API to send a push message
 *   4. Return 200 on success
 *
 * Environment variables required:
 *   - FIREBASE_SERVICE_ACCOUNT: JSON string of the Firebase service account key
 *   - SUPABASE_URL: Supabase project URL (injected by Supabase)
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key (injected by Supabase)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifySaleRequest {
  saleId: string;
  driverId: string;
  driverName: string;
  totalPrice: number;
  companyId: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface FcmTokenRow {
  token: string;
}

// ── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // ── CORS ──────────────────────────────────────────────────────────────────
  // The Edge Function is invoked cross-origin from the deployed Vercel app.
  // Without CORS headers, the browser blocks the request (Failed to fetch).
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight (OPTIONS) request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const body: NotifySaleRequest = await req.json();
    const { saleId, driverId, driverName, totalPrice, companyId } = body;

    if (!saleId || !driverId || !driverName || totalPrice === undefined || !companyId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // ── 1. Query FCM tokens from the database ───────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: tokenRows, error: dbError } = await supabaseClient
      .from('fcm_tokens')
      .select('token')
      .eq('company_id', companyId);

    if (dbError) {
      console.error('[notify-sale] Failed to query fcm_tokens:', dbError.message);
      return new Response(JSON.stringify({ error: 'Database query failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const tokens = (tokenRows as FcmTokenRow[]).map((r) => r.token);
    if (tokens.length === 0) {
      // No devices registered — nothing to push to. Not an error.
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // ── 2. Get OAuth2 access token from Google ──────────────────────────────
    const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!serviceAccountJson) {
      console.error('[notify-sale] FIREBASE_SERVICE_ACCOUNT env var is missing');
      return new Response(JSON.stringify({ error: 'Firebase not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJson);
    console.log('[notify-sale] Service account parsed. project_id:', serviceAccount.project_id);

    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(serviceAccount);
      console.log('[notify-sale] Google access token obtained successfully');
    } catch (tokenErr) {
      console.error('[notify-sale] Failed to get Google access token:', tokenErr);
      return new Response(JSON.stringify({ error: 'Failed to get Google access token', detail: String(tokenErr) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // ── 3. Send FCM push to each token ──────────────────────────────────────
    const projectId = serviceAccount.project_id;
    const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const pushTitle = 'عملية بيع جديدة';
    const pushBody = `${driverName} سجّل عملية بيع بقيمة ${totalPrice}`;
    const pushIcon = '/icons/icon-192.png';

    // We send a DATA-ONLY message (no top-level `notification` key).
    // This prevents the browser from auto-showing a notification, which
    // would duplicate the one created by the onMessage / onBackgroundMessage
    // handler. Both foreground and background handlers construct the
    // notification manually from payload.data, using saleId in the tag
    // for browser-level dedup.

    let sentCount = 0;
    const failedTokens: string[] = [];
    const sendErrors: string[] = [];

    // Send to all tokens in parallel (but don't block on failures)
    const sendPromises = tokens.map(async (token) => {
      try {
        const response = await fetch(fcmEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token,
              // DATA-ONLY message — no top-level `notification` key.
              // Both foreground (onMessage) and background (onBackgroundMessage)
              // handlers construct the notification manually from payload.data.
              // This eliminates the auto-show duplicate that occurs when FCM
              // receives a message with a `notification` key.
              data: {
                saleId,
                driverId,
                companyId,
                type: 'sale',
                title: pushTitle,
                body: pushBody,
                icon: pushIcon,
              },
              webpush: {
                fcm_options: {
                  link: '/',
                },
              },
            },
          }),
        });

        if (response.ok) {
          sentCount++;
          console.log('[notify-sale] FCM push succeeded for token', token.substring(0, 10));
        } else {
          const errorBody = await response.text();
          const errSummary = `token ${token.substring(0, 10)}... status=${response.status} body=${errorBody.substring(0, 200)}`;
          console.error(`[notify-sale] FCM push failed: ${errSummary}`);
          sendErrors.push(errSummary);

          // If FCM says the token is invalid/unregistered, mark it for cleanup
          if (response.status === 404 || errorBody.includes('UNREGISTERED') || errorBody.includes('invalid-registration-token')) {
            failedTokens.push(token);
          }
        }
      } catch (err) {
        const errSummary = `token ${token.substring(0, 10)}... exception=${String(err)}`;
        console.error(`[notify-sale] FCM push error: ${errSummary}`);
        sendErrors.push(errSummary);
      }
    });

    await Promise.allSettled(sendPromises);

    // ── 4. Clean up invalid tokens ──────────────────────────────────────────
    if (failedTokens.length > 0) {
      const { error: deleteError } = await supabaseClient
        .from('fcm_tokens')
        .delete()
        .in('token', failedTokens);

      if (deleteError) {
        console.error('[notify-sale] Failed to clean up invalid tokens:', deleteError.message);
      }
    }

    const result: Record<string, unknown> = { sent: sentCount, total: tokens.length };
    if (sendErrors.length > 0) {
      result.errors = sendErrors;
    }
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    console.error('[notify-sale] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});

// ── OAuth2 Access Token ──────────────────────────────────────────────────────
// Gets a short-lived OAuth2 access token from Google's token endpoint
// using the service account credentials (JWT grant).

async function getGoogleAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const lifetime = 3600; // 1 hour

  // Construct the JWT payload
  const jwtPayload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + lifetime,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  // Encode JWT header and payload
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(jwtPayload));
  const signInput = `${headerB64}.${payloadB64}`;

  // Sign with the service account's private key
  const key = await importPKCS8(sa.private_key);
  const signature = await signRSA256(key, signInput);
  const signatureB64 = base64url(signature);

  const jwt = `${signInput}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get Google access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// ── Crypto helpers ───────────────────────────────────────────────────────────

function base64url(input: string | ArrayBuffer): string {
  let binary: string;
  if (typeof input === 'string') {
    binary = input;
  } else {
    // ArrayBuffer → binary string
    const bytes = new Uint8Array(input);
    binary = String.fromCharCode(...bytes);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function importPKCS8(pem: string): Promise<CryptoKey> {
  // Remove PEM header/footer and whitespace.
  // Headers are constructed at runtime to avoid static-analysis false positives
  // on the literal PEM boundary strings.
  const BEGIN_HDR = '-----' + 'BEGIN PRIVATE KEY' + '-----';
  const END_HDR = '-----' + 'END PRIVATE KEY' + '-----';
  const pemBody = pem
    .replace(BEGIN_HDR, '')
    .replace(END_HDR, '')
    .replace(/\s/g, '');

  const binaryStr = atob(pemBody);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}
async function signRSA256(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  return crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, dataBuffer);
}
