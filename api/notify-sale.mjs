/**
 * Vercel Serverless Function: POST /api/notify-sale
 *
 * Sends an FCM push notification to the company owner when a driver
 * records a new sale. This is the server-side piece that makes
 * notifications work even when the PWA is completely closed — the
 * browser's push service wakes the service worker, which shows the
 * notification via onBackgroundMessage.
 *
 * Request body:
 *   { saleId, driverId, driverName, totalPrice, companyId }
 *
 * Flow:
 *   1. Query Supabase `fcm_tokens` for the company's push tokens
 *   2. For each token, send a data-only FCM message via HTTP v1 API
 *   3. Clean up invalid tokens (NotRegistered / MismatchSenderId)
 *
 * Required Vercel environment variables:
 *   SUPABASE_URL             — e.g. https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service_role key (bypasses RLS on fcm_tokens)
 *   FIREBASE_PROJECT_ID      — e.g. track-tracker-ca74a
 *   FIREBASE_CLIENT_EMAIL    — Firebase service account email
 *   FIREBASE_PRIVATE_KEY     — Firebase service account private key (PEM)
 */

// ── Types ────────────────────────────────────────────────────────────────────
interface NotifySaleRequest {
  saleId: string;
  driverId: string;
  driverName: string;
  totalPrice: string;
  companyId: string;
}

interface FcmTokenRow {
  token: string;
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req: {
  method?: string;
  body?: NotifySaleRequest;
  headers?: Record<string, string>;
}, res: {
  status: (code: number) => { json: (body: unknown) => void };
  setHeader: (key: string, value: string) => void;
}) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { saleId, driverId, driverName, totalPrice, companyId } = req.body ?? {};

  if (!saleId || !driverId || !companyId) {
    return res.status(400).json({ error: 'Missing required fields: saleId, driverId, companyId' });
  }

  try {
    // 1. Fetch FCM tokens for this company from Supabase
    const tokens = await getCompanyTokens(companyId);

    if (tokens.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No FCM tokens found for company' });
    }

    // 2. Get Firebase access token
    const accessToken = await getFirebaseAccessToken();

    // 3. Send FCM push to each token
    const projectId = getEnv('FIREBASE_PROJECT_ID');
    const invalidTokens: string[] = [];
    let sentCount = 0;

    for (const token of tokens) {
      const result = await sendFcmMessage(accessToken, projectId, token, {
        saleId,
        driverId,
        driverName: driverName ?? 'سائق',
        totalPrice: totalPrice ?? '',
        type: 'sale',
      });

      if (result.success) {
        sentCount++;
      } else if (result.shouldRemove) {
        invalidTokens.push(token);
      }
    }

    // 4. Clean up invalid tokens
    if (invalidTokens.length > 0) {
      await removeInvalidTokens(invalidTokens);
    }

    return res.status(200).json({ sent: sentCount, invalid: invalidTokens.length });
  } catch (err) {
    console.error('[notify-sale] Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function getCompanyTokens(companyId: string): Promise<string[]> {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  const resp = await fetch(
    `${supabaseUrl}/rest/v1/fcm_tokens?select=token&company_id=eq.${companyId}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase query failed: ${resp.status} ${text}`);
  }

  const rows: FcmTokenRow[] = await resp.json();
  return rows.map((r) => r.token);
}

async function removeInvalidTokens(tokens: string[]): Promise<void> {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  // Delete each invalid token
  for (const token of tokens) {
    await fetch(
      `${supabaseUrl}/rest/v1/fcm_tokens?token=eq.${encodeURIComponent(token)}`,
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
  }
}

// ── Firebase FCM helpers ─────────────────────────────────────────────────────

/**
 * Get an OAuth2 access token for the FCM HTTP v1 API by signing a JWT
 * with the Firebase service account credentials.
 */
async function getFirebaseAccessToken(): Promise<string> {
  const clientEmail = getEnv('FIREBASE_CLIENT_EMAIL');
  const privateKey = getEnv('FIREBASE_PRIVATE_KEY');
  const projectId = getEnv('FIREBASE_PROJECT_ID');

  const now = Math.floor(Date.now() / 1000);
  const lifetime = 3600; // 1 hour

  // JWT payload
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + lifetime,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  // JWT header
  const header = { alg: 'RS256', typ: 'JWT' };

  const base64url = (data: string) =>
    btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signInput = `${headerB64}.${payloadB64}`;

  // Import the private key (DER-encoded PKCS8)
  const keyData = pemToDer(privateKey);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Sign
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signInput),
  );

  const sigB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${signInput}.${sigB64}`;

  // Exchange JWT for access token
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    throw new Error(`Token exchange failed: ${tokenResp.status} ${text}`);
  }

  const tokenData = await tokenResp.json();
  return tokenData.access_token;
}

/**
 * Send a data-only FCM message via the HTTP v1 API.
 * Data-only messages are handled by the service worker's onBackgroundMessage
 * rather than being auto-displayed by the browser.
 */
async function sendFcmMessage(
  accessToken: string,
  projectId: string,
  fcmToken: string,
  data: Record<string, string>,
): Promise<{ success: boolean; shouldRemove: boolean }> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        data, // data-only message — no `notification` key
      },
    }),
  });

  if (resp.ok) {
    return { success: true, shouldRemove: false };
  }

  const errorBody = await resp.json().catch(() => ({}));
  const errorCode =
    errorBody?.error?.details?.[0]?.errorCode ??
    errorBody?.error?.status ??
    '';

  // Token is no longer valid — remove it
  if (
    errorCode === 'UNREGISTERED' ||
    errorCode === 'INVALID_ARGUMENT' ||
    resp.status === 404
  ) {
    console.warn(`[notify-sale] Invalid token (will remove): ${fcmToken.substring(0, 20)}...`);
    return { success: false, shouldRemove: true };
  }

  console.error(`[notify-sale] FCM send failed: ${resp.status}`, errorBody);
  return { success: false, shouldRemove: false };
}

// ── Utility ──────────────────────────────────────────────────────────────────

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Convert a PEM-encoded private key to DER binary (Uint8Array).
 * crypto.subtle.importKey('pkcs8') requires DER, not PEM.
 */
function pemToDer(pem: string): Uint8Array {
  // The PEM may have escaped newlines from env vars (\n → actual newline)
  const normalized = pem.replace(/\\n/g, '\n');

  // Extract base64 body between BEGIN/END markers
  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('-----'));

  const b64 = lines.join('');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
