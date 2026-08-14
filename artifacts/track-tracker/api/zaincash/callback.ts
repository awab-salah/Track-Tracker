// Build: 1786727403
/**
 * GET/POST /api/zaincash/callback
 *
 * ZainCash v1 payment callback endpoint.
 *
 * In the ZainCash v1 API, there is NO separate server-to-server callback.
 * Instead, after payment completion, ZainCash REDIRECTS the user's browser
 * to the `redirectUrl` from the JWT payload, appending ?token=XXXXX.
 *
 * The token is a JWT containing: { status, orderid, id, iat, exp }
 *   - status: "success"/"completed" (paid) or "failed" (failed/cancelled)
 *   - orderid: the orderId we sent in the init JWT
 *   - id: the ZainCash transaction ID
 *
 * We also support POST for potential v2 server-to-server callbacks.
 * Always verifies via v1 inquiry API — NEVER trusts the callback payload alone.
 *
 * Idempotency: Checks payment_records before activating subscription.
 * The same callback never activates a subscription twice.
 */

import crypto from 'crypto';

// Inline Vercel types to avoid @vercel/node dependency
interface VercelRequest {
  method: string | null;
  body: unknown;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  end(): VercelResponse;
  setHeader(name: string, value: string): VercelResponse;
  write(body: string | Buffer): VercelResponse;
  getHeader(name: string): string | string[] | undefined;
}

// ── Config ────────────────────────────────────────────────────────────────────
// Sandbox defaults: official test credentials from ZainCash Laravel package

const SANDBOX_DEFAULTS = {
  baseUrl:    'https://test.zaincash.iq',
  msisdn:     '9647835077893',
  merchantId: '5ffacf6612b5777c6d44266f',
  secret:     '$2y$10$hBbAZo2GfSSvyqAyV2SaqOfYewgYpfR1O19gIh4SqyGWdmySZYPuS',
};

function getConfig() {
  return {
    baseUrl:    process.env.ZAINCASH_BASE_URL      || SANDBOX_DEFAULTS.baseUrl,
    msisdn:     process.env.ZAINCASH_MSISDN         || SANDBOX_DEFAULTS.msisdn,
    merchantId: process.env.ZAINCASH_MERCHANT_ID    || SANDBOX_DEFAULTS.merchantId,
    secret:     process.env.ZAINCASH_SECRET_KEY     || SANDBOX_DEFAULTS.secret,
  };
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

function getSupabaseCreds() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  console.log('[ZainCash] Supabase creds: url=', url ? url.substring(0, 30) + '...' : 'MISSING', 'key=', key ? key.substring(0, 10) + '...' : 'MISSING');
  return { url, key };
}

// ── JWT ──────────────────────────────────────────────────────────────────────

function base64UrlEncode(data: string): string {
  return Buffer.from(data, 'utf-8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJWT(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${headerB64}.${payloadB64}.${signature}`;
}

function decodeJwt(token: string, secret: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf-8');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  if (signature !== parts[2]) throw new Error('JWT signature verification failed');
  return JSON.parse(payloadJson);
}

// ── Inquiry via v1 API ──────────────────────────────────────────────────────

async function inquireTransaction(transactionId: string) {
  const config = getConfig();

  // Create JWT for inquiry
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    id: transactionId,
    msisdn: config.msisdn,
    iat: now,
    exp: now + 60 * 60 * 4,
  };
  const token = createJWT(jwtPayload, config.secret);

  // v1 API: POST /transaction/get with application/x-www-form-urlencoded
  const inquiryUrl = `${config.baseUrl}/transaction/get`;
  const inquiryParams = new URLSearchParams();
  inquiryParams.append('merchantId', config.merchantId);
  inquiryParams.append('token', token);

  const response = await fetch(inquiryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: inquiryParams.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[ZainCash] Callback inquiry failed:', response.status, text);
    throw new Error(`Inquiry failed: ${response.status} — ${text}`);
  }

  return response.json();
}

// ── Payment record helpers ───────────────────────────────────────────────────

/** Look up a payment record by transaction ID. Returns status + company_id or null. */
async function getPaymentRecord(transactionId: string): Promise<{ status: string; company_id: string } | null> {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) return null;

  // Use the security-definer RPC to read payment_records.
  // Direct PostgREST SELECT with anon key + RLS returns empty rows
  // (SELECT policy requires auth.uid() which server-side doesn't have).
  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_payment_record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_id: transactionId }),
    });

    if (!res.ok) throw new Error(`RPC failed: ${res.status}`);
    const rows = await res.json() as Array<{ status: string; company_id: string }>;
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    // Fallback: try direct PostgREST SELECT (works with service key)
    console.warn('[ZainCash] RPC get_payment_record failed, trying direct SELECT:', err);
    const res = await fetch(`${url}/rest/v1/payment_records?id=eq.${transactionId}&select=status,company_id`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    if (!res.ok) return null;
    const rows = await res.json() as Array<{ status: string; company_id: string }>;
    return rows.length > 0 ? rows[0] : null;
  }
}

async function updatePaymentRecord(transactionId: string, status: string): Promise<boolean> {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) {
    console.warn('[ZainCash] updatePaymentRecord: missing Supabase creds');
    return false;
  }

  // Use the security-definer RPC to update payment_records.
  // Direct PostgREST PATCH with anon key + RLS silently fails to update rows
  // (PostgREST 204 but 0 rows affected). The RPC bypasses RLS.
  try {
    const rpcUrl = `${url}/rest/v1/rpc/update_payment_record`;
    console.log('[ZainCash] updatePaymentRecord: calling RPC', rpcUrl, 'tx=', transactionId, 'status=', status);
    const rpcRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_id: transactionId, p_status: status }),
    });
    const rpcBody = await rpcRes.text();
    console.log('[ZainCash] updatePaymentRecord: RPC response', rpcRes.status, rpcBody);
    if (!rpcRes.ok) {
      throw new Error(`RPC returned ${rpcRes.status}: ${rpcBody}`);
    }
    return true;
  } catch (err) {
    console.warn('[ZainCash] RPC update_payment_record failed, trying direct PATCH:', err);
    // Fallback to direct PATCH (works with service key which bypasses RLS)
    try {
      const patchRes = await fetch(`${url}/rest/v1/payment_records?id=eq.${transactionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      });
      console.log('[ZainCash] updatePaymentRecord: fallback PATCH response', patchRes.status);
      return patchRes.ok;
    } catch (patchErr) {
      console.error('[ZainCash] updatePaymentRecord: PATCH also failed:', patchErr);
      return false;
    }
  }
}

async function activateSubscription(companyId: string): Promise<boolean> {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) return false;

  // companyId is the company NAME (text), not the UUID id.
  // The ZainCash flow sends company.name as companyId (see useZainCashPayment.ts).
  // Use name=eq to match the companies.name column.
  const res = await fetch(`${url}/rest/v1/companies?name=eq.${encodeURIComponent(companyId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ subscription_active: true }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[ZainCash] Failed to activate subscription:', res.status, text);
    return false;
  }

  // Verify at least one row was updated by checking the response
  // (PostgREST with Prefer:return=minimal returns 204 even for 0 rows)
  // Do a follow-up SELECT to confirm the subscription is now active
  const verifyRes = await fetch(
    `${url}/rest/v1/companies?name=eq.${encodeURIComponent(companyId)}&select=subscription_active`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    }
  );
  if (verifyRes.ok) {
    const rows = await verifyRes.json() as Array<{ subscription_active: boolean }>;
    if (rows.length > 0 && rows[0].subscription_active === true) {
      console.log('[ZainCash] Subscription activation confirmed for company:', companyId);
      return true;
    }
    console.error('[ZainCash] Subscription activation NOT confirmed for company:', companyId, 'rows:', rows);
    return false;
  }

  return true;
}

// ── Core callback processing ─────────────────────────────────────────────────
// Shared by GET (v1 redirect) and POST (potential v2 server-to-server)

async function processCallback(params: {
  transactionId: string;
  orderId?: string;
  planId?: string;
  companyId?: string;
  tokenStatus?: string; // status from decoded JWT token (before inquiry)
}): Promise<{ success: boolean; transactionId: string; status: string; message: string }> {
  const { transactionId } = params;

  if (!transactionId) {
    return { success: false, transactionId: '', status: 'invalid', message: 'Missing transaction ID' };
  }

  // ── Idempotency check: if payment already completed, skip everything ──────
  const existingRecord = await getPaymentRecord(transactionId);
  if (existingRecord?.status === 'completed') {
    console.log('[ZainCash] Callback: payment already completed (idempotent skip):', transactionId);
    return {
      success: true,
      transactionId,
      status: 'completed',
      message: 'Payment already processed (idempotent)',
    };
  }

  // ── Always verify via inquiry — NEVER trust the callback payload alone ────
  console.log('[ZainCash] Verifying transaction via inquiry:', transactionId);
  let details: { status: string; orderId: string };
  try {
    details = await inquireTransaction(transactionId) as {
      status: string;
      orderId: string;
    };
  } catch (inquiryErr) {
    // ZainCash inquiry failed (e.g. 503 Service Unavailable).
    // Still update the payment record so we know the callback was received.
    const inquiryMessage = inquiryErr instanceof Error ? inquiryErr.message : String(inquiryErr);
    console.error('[ZainCash] Inquiry failed for', transactionId, ':', inquiryMessage);
    await updatePaymentRecord(transactionId, 'pending'); // Keep as pending — will retry later
    return {
      success: false,
      transactionId,
      status: 'pending',
      message: `Inquiry failed (will retry): ${inquiryMessage}`,
    };
  }

  // Determine companyId: prefer payment_records, then query params, then parse orderId
  let companyId = params.companyId ?? '';

  if (!companyId && existingRecord?.company_id) {
    companyId = existingRecord.company_id;
  }

  if (!companyId) {
    // Last resort: try to extract from query params or orderId
    // (orderId format: tt-{planId}-{companyId}-{timestamp}-{random})
    // This is fragile — prefer payment_records lookup instead.
    const verifiedOrderId = details.orderId || params.orderId || '';
    // Since planId contains dashes (e.g. "plan-10"), we can't simply split by dash.
    // Use the companyId from query params if available.
    console.warn('[ZainCash] Cannot reliably extract companyId from orderId. Using query param fallback.');
  }

  console.log('[ZainCash] Transaction verified:', transactionId, 'status:', details.status, 'companyId:', companyId);

  // Update payment record
  const updateOk = await updatePaymentRecord(transactionId, details.status);

  // Only activate if payment is COMPLETED and we have a companyId
  if (details.status === 'completed' && companyId) {
    const activated = await activateSubscription(companyId);
    if (activated) {
      console.log('[ZainCash] Subscription activated for company:', companyId);
    } else {
      console.error('[ZainCash] Failed to activate subscription for company:', companyId);
    }
  }

  return {
    success: details.status === 'completed',
    transactionId,
    status: details.status,
    message: details.status === 'completed' ? 'Payment completed' : `Payment status: ${details.status}`,
    _updateOk: updateOk, // debug: whether payment_records UPDATE succeeded
  };
}

// ── HTML redirect page ───────────────────────────────────────────────────────
// After processing the GET callback, redirect the user to the subscriptions page.
// We render a minimal HTML page that auto-redirects.

function redirectPage(status: string, success: boolean): string {
  const targetUrl = '/subscriptions';
  const icon = success ? '✓' : '✗';
  const color = success ? '#16a34a' : '#dc2626';
  const title = success ? 'تم الدفع بنجاح' : 'فشلت عملية الدفع';
  const subtitle = success
    ? 'جارٍ التحويل إلى صفحة الاشتراكات...'
    : 'لم يتم الدفع، جارٍ التحويل...';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { text-align: center; padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 2px 12px rgba(0,0,0,0.08); max-width: 320px; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.5rem; color: ${color}; }
    p { font-size: 0.875rem; color: #666; margin: 0; }
  </style>
  <meta http-equiv="refresh" content="3;url=${targetUrl}">
</head>
<body>
  <div class="card">
    <div class="icon" style="color:${color}">${icon}</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
  </div>
  <script>setTimeout(function(){ window.location.href="${targetUrl}"; }, 3000);</script>
</body>
</html>`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // ══════════════════════════════════════════════════════════════════════════
  // GET — ZainCash v1 redirect callback
  // After payment, ZainCash redirects the user's browser to redirectUrl?token=XXXXX
  // This is the primary callback mechanism in the v1 API.
  // ══════════════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    try {
      const query = req.query;
      const token = typeof query.token === 'string' ? query.token : '';
      const orderId = typeof query.orderId === 'string' ? query.orderId : '';
      const planId = typeof query.planId === 'string' ? query.planId : '';
      const companyId = typeof query.companyId === 'string' ? query.companyId : '';

      // No token = user cancelled payment (ZainCash redirects without token on cancel)
      if (!token) {
        console.log('[ZainCash] GET callback without token — payment cancelled by user');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).end(redirectPage('cancelled', false));
      }

      const config = getConfig();

      // Decode the JWT token from ZainCash
      let transactionId = '';
      let tokenStatus = '';
      try {
        const payload = decodeJwt(token, config.secret);
        transactionId = String(payload.id ?? '');
        tokenStatus = String(payload.status ?? '');
        console.log('[ZainCash] GET callback: decoded token — id:', transactionId, 'status:', tokenStatus);
      } catch (jwtErr) {
        console.error('[ZainCash] GET callback: JWT decode failed:', jwtErr);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(400).end(redirectPage('invalid', false));
      }

      if (!transactionId) {
        console.error('[ZainCash] GET callback: no transactionId in token');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(400).end(redirectPage('invalid', false));
      }

      // Process the callback
      const result = await processCallback({
        transactionId,
        orderId,
        planId,
        companyId,
        tokenStatus,
      });

      // Return an HTML page that auto-redirects to /subscriptions
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).end(redirectPage(result.status, result.success));

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ZainCash] GET callback error:', message);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).end(redirectPage('error', false));
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POST — Potential v2 server-to-server callback
  // ZainCash v1 uses GET redirect, but we keep POST support for future
  // v2 compatibility or manual testing.
  // ══════════════════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    try {
      const body = req.body as Record<string, unknown>;
      const config = getConfig();

      let transactionId = '';
      let orderId = '';
      let companyId = '';

      // Handle v1 JWT callback body (ZainCash sends { token: "jwt..." })
      if (body.token && typeof body.token === 'string') {
        console.log('[ZainCash] POST callback: v1 JWT body received');
        try {
          const payload = decodeJwt(body.token as string, config.secret);
          transactionId = String(payload.id ?? payload.transactionId ?? '');
          orderId = String(payload.orderId ?? '');
        } catch (jwtErr) {
          console.error('[ZainCash] POST callback: JWT decode failed:', jwtErr);
          return res.status(400).json({ error: 'Invalid JWT token', received: false });
        }
      }

      // Handle v2/direct JSON callback (fallback)
      if (!transactionId) {
        console.log('[ZainCash] POST callback: JSON body received');
        transactionId = String(body.id ?? body.transactionId ?? '');
        orderId = String(body.orderId ?? '');
        companyId = String(body.companyId ?? '');
      }

      if (!transactionId) {
        return res.status(400).json({ error: 'Missing transaction ID', received: false });
      }

      // Process the callback
      const result = await processCallback({
        transactionId,
        orderId,
        companyId,
      });

      return res.status(200).json({
        received: true,
        transactionId: result.transactionId,
        status: result.status,
        _updateOk: (result as Record<string, unknown>)._updateOk,
        _message: result.message,
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ZainCash] POST callback error:', message);
      // Return 200 to prevent retry, but include the real error
      return res.status(200).json({ received: true, error: message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
