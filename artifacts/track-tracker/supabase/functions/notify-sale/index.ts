/**
 * Supabase Edge Function: notify-sale
 *
 * Receives a POST with { driverId, driverName, totalPrice, companyId },
 * queries `fcm_tokens` for that company, signs a JWT using the Firebase
 * service account, and sends an FCM HTTP v1 API push to each token.
 *
 * Invalid tokens are cleaned up (deleted from fcm_tokens).
 *
 * Environment secrets (set via `supabase secrets set`):
 *   FIREBASE_SERVICE_ACCOUNT  — JSON string of the Firebase Admin SDK key
 */

// @ts-nocheck — Deno runtime, not Node

const BEGIN_HDR = '-----' + 'BEGIN PRIVATE KEY' + '-----';
const END_HDR   = '-----' + 'END PRIVATE KEY'   + '-----';

// ── Crypto helpers ──────────────────────────────────────────────────────────

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function pemToBytes(pem: string): ArrayBuffer {
  const body = pem
    .replace(BEGIN_HDR, '')
    .replace(END_HDR, '')
    .replace(/\s/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function importPKCS8(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

// ── JWT ─────────────────────────────────────────────────────────────────────

async function signJwt(
  header: object,
  payload: object,
  key: CryptoKey,
): Promise<string> {
  const h = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const p = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${h}.${p}`),
  );
  return `${h}.${p}.${base64url(sig)}`;
}

// ── Main ────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // ── 1. Parse request body ───────────────────────────────────────────────
    const { driverId, driverName, totalPrice, companyId } = await req.json();
    if (!companyId) {
      return new Response(JSON.stringify({ error: 'companyId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`[notify-sale] Sale by driver ${driverName} (${driverId}) for company ${companyId}, amount ${totalPrice}`);

    // ── 2. Get Firebase service account from env ────────────────────────────
    const saRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!saRaw) {
      console.error('[notify-sale] FIREBASE_SERVICE_ACCOUNT secret not set');
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: missing Firebase service account' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    let sa: { project_id: string; private_key: string; client_email: string };
    try {
      sa = JSON.parse(saRaw);
    } catch {
      console.error('[notify-sale] FIREBASE_SERVICE_ACCOUNT is not valid JSON');
      return new Response(
        JSON.stringify({ error: 'Server misconfigured: invalid Firebase service account' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── 3. Query fcm_tokens for this company ────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const tokensRes = await fetch(
      `${supabaseUrl}/rest/v1/fcm_tokens?company_id=eq.${companyId}&select=token`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!tokensRes.ok) {
      const errText = await tokensRes.text();
      console.error(`[notify-sale] Failed to query fcm_tokens: ${tokensRes.status} ${errText}`);
      return new Response(
        JSON.stringify({ error: 'Failed to query tokens' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const tokenRows: { token: string }[] = await tokensRes.json();
    if (tokenRows.length === 0) {
      console.log('[notify-sale] No FCM tokens registered for company — skipping push');
      return new Response(
        JSON.stringify({ sent: 0, reason: 'no_tokens' }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[notify-sale] Found ${tokenRows.length} FCM token(s) for company ${companyId}`);

    // ── 4. Sign JWT for FCM HTTP v1 API ─────────────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    const privateKey = await importPKCS8(sa.private_key);

    const accessToken = await signJwt(
      { alg: 'RS256', typ: 'JWT' },
      {
        iss: sa.client_email,
        sub: sa.client_email,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
      },
      privateKey,
    );

    // Exchange JWT for OAuth2 access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${accessToken}`,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[notify-sale] OAuth2 token exchange failed: ${tokenRes.status} ${errText}`);
      return new Response(
        JSON.stringify({ error: 'OAuth2 token exchange failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { access_token: oauthAccessToken } = await tokenRes.json();

    // ── 5. Send FCM push to each token ──────────────────────────────────────
    const projectId = sa.project_id;
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const notification = {
      title: 'عملية بيع جديدة',
      body: `${driverName || 'سائق'} سجّل عملية بيع بقيمة ${totalPrice} د.ع`,
      icon: '/icons/icon-192.png',
    };

    const tokensToDelete: string[] = [];
    let sentCount = 0;

    for (const { token } of tokenRows) {
      const pushRes = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${oauthAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification,
            data: {
              driverId: driverId || '',
              companyId,
              type: 'sale',
            },
          },
        }),
      });

      if (pushRes.ok) {
        sentCount++;
        console.log(`[notify-sale] Push sent to token ${token.slice(0, 12)}…`);
      } else {
        const errBody = await pushRes.json().catch(() => ({}));
        const errCode = errBody.error?.details?.[0]?.errorCode || errBody.error?.code || 'UNKNOWN';
        console.error(`[notify-sale] Push failed for token ${token.slice(0, 12)}…: ${pushRes.status} ${errCode}`);

        // UNREGISTERED or INVALID_ARGUMENT → token is stale, clean it up
        if (
          errCode === 'UNREGISTERED' ||
          errCode === 'INVALID_ARGUMENT' ||
          pushRes.status === 404
        ) {
          tokensToDelete.push(token);
        }
      }
    }

    // ── 6. Clean up stale tokens ────────────────────────────────────────────
    if (tokensToDelete.length > 0) {
      const deleteRes = await fetch(
        `${supabaseUrl}/rest/v1/fcm_tokens?token=in.(${tokensToDelete.map((t) => `"${t}"`).join(',')})`,
        {
          method: 'DELETE',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
        },
      );
      if (deleteRes.ok) {
        console.log(`[notify-sale] Cleaned up ${tokensToDelete.length} stale token(s)`);
      } else {
        console.error('[notify-sale] Failed to clean up stale tokens:', await deleteRes.text());
      }
    }

    return new Response(
      JSON.stringify({ sent: sentCount, total: tokenRows.length, cleaned: tokensToDelete.length }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[notify-sale] Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
