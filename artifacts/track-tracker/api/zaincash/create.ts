/**
 * POST /api/zaincash/create
 *
 * Creates a ZainCash payment transaction and returns the redirect URL.
 *
 * Uses ZainCash v1 API (JWT-based authentication).
 * The v2 OAuth2 API is behind Cloudflare WAF and returns 403 for
 * server-to-server requests. All production ZainCash integrations
 * (Laravel, Flutter packages) use the v1 JWT flow.
 *
 * v1 Flow:
 *   1. Create JWT payload { amount, serviceType, msisdn, orderId, redirectUrl, iat, exp }
 *   2. Sign with HMAC-SHA256 using the secret key
 *   3. POST to {baseUrl}/transaction/init with { lang, merchantId, token }
 *   4. Response: { id, rUrl } — redirect user to rUrl + id
 *
 * Request body:
 *   { planId: string, amount: number, companyId: string }
 *
 * Response:
 *   { transactionId: string, redirectUrl: string, orderId: string }
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
}

// ── Config ────────────────────────────────────────────────────────────────────
//
// ZainCash v1 API uses JWT (HMAC-SHA256) signed with a secret key.
// The merchant is identified by merchantId + msisdn.
//
// Sandbox defaults: official test credentials from the ZainCash Laravel package
// (https://github.com/waadmawlood/zaincash) and docs.zaincash.iq.
// These are the ONLY documented test credentials for the sandbox environment.
// Switch to production by setting env vars — no code changes needed.

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
    redirectUrl: process.env.ZAINCASH_REDIRECT_URL  ?? '',
    lang:       process.env.ZAINCASH_LANG           ?? 'ar',
  };
}

// ── JWT Helpers ──────────────────────────────────────────────────────────────

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

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { planId, amount, companyId } = req.body as {
      planId?: string;
      amount?: number;
      companyId?: string;
    };

    // Validate required fields
    if (!planId || !amount || !companyId) {
      return res.status(400).json({ error: 'Missing required fields: planId, amount, companyId' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    const config = getConfig();

    // Check ZainCash is configured (v1 API requires msisdn, merchantId, and secret)
    if (!config.msisdn || !config.merchantId || !config.secret) {
      console.error('[ZainCash] Not configured — missing msisdn, merchantId, or secret');
      return res.status(503).json({
        error: 'ZainCash payment gateway not configured',
        details: 'Missing required credentials: msisdn, merchantId, or secret key',
      });
    }

    // Generate unique order ID
    const orderId = `tt-${planId}-${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build redirect URL for after payment
    const redirectUrl = config.redirectUrl
      ? `${config.redirectUrl}?orderId=${orderId}&planId=${planId}&companyId=${companyId}`
      : '';

    // ── Step 1: Create JWT token ────────────────────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      amount,
      serviceType: 'subscription',
      msisdn: config.msisdn,
      orderId,
      redirectUrl,
      iat: now,
      exp: now + 60 * 60 * 4, // 4 hours expiry
    };

    const token = createJWT(jwtPayload, config.secret);
    console.log('[ZainCash] JWT token created for order:', orderId);

    // ── Step 2: Initiate transaction via v1 API ─────────────────────────────
    // ZainCash v1 API requires application/x-www-form-urlencoded, NOT JSON.
    // The token is URL-encoded once by URLSearchParams.
    const initUrl = `${config.baseUrl}/transaction/init`;

    const initParams = new URLSearchParams();
    initParams.append('token', token);
    initParams.append('merchantId', config.merchantId);
    initParams.append('lang', config.lang);

    console.log('[ZainCash] Initiating transaction at:', initUrl);
    console.log('[ZainCash] Content-Type: application/x-www-form-urlencoded');
    console.log('[ZainCash] merchantId:', config.merchantId);
    console.log('[ZainCash] lang:', config.lang);
    console.log('[ZainCash] JWT payload (decoded):', JSON.stringify(jwtPayload));
    console.log('[ZainCash] msisdn type in JWT:', typeof jwtPayload.msisdn, '| value:', jwtPayload.msisdn);
    console.log('[ZainCash] amount type in JWT:', typeof jwtPayload.amount, '| value:', jwtPayload.amount);

    const initResponse = await fetch(initUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: initParams.toString(),
    });

    const initText = await initResponse.text();
    console.log('[ZainCash] Init response status:', initResponse.status);
    console.log('[ZainCash] Init response body:', initText);

    if (!initResponse.ok) {
      console.error('[ZainCash] Init failed:', initResponse.status, initText);
      return res.status(502).json({
        error: 'ZainCash transaction init failed',
        step: 'transaction_init',
        zaincashStatus: initResponse.status,
        zaincashResponse: initText,
      });
    }

    let initData: { id?: string; rUrl?: string; err?: { msg?: string } };
    try {
      initData = JSON.parse(initText);
    } catch {
      console.error('[ZainCash] Invalid JSON response:', initText);
      return res.status(502).json({
        error: 'Invalid JSON from ZainCash',
        step: 'transaction_init',
        zaincashResponse: initText,
      });
    }

    // Check for error in response body (ZainCash returns errors as { err: { msg } })
    if (initData.err) {
      console.error('[ZainCash] ZainCash error:', initData.err);
      return res.status(502).json({
        error: 'ZainCash rejected the transaction',
        step: 'transaction_init',
        zaincashError: initData.err,
      });
    }

    if (!initData.id) {
      console.error('[ZainCash] No transaction ID in response:', initData);
      return res.status(502).json({
        error: 'No transaction ID from ZainCash',
        step: 'transaction_init',
        zaincashResponse: initData,
      });
    }

    // v1 API returns { id, rUrl } where rUrl is the base redirect URL
    // Full redirect URL = rUrl + id
    const redirectUrlFull = initData.rUrl
      ? `${initData.rUrl}${initData.id}`
      : `${config.baseUrl}/transaction/pay?id=${initData.id}`;

    console.log('[ZainCash] Transaction created:', initData.id, 'for order:', orderId);
    console.log('[ZainCash] Redirect URL:', redirectUrlFull);

    // Store payment record in Supabase (fire-and-forget)
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        await fetch(`${supabaseUrl}/rest/v1/payment_records`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            id: initData.id,
            order_id: orderId,
            company_id: companyId,
            plan_id: planId,
            amount,
            status: 'pending',
            created_at: new Date().toISOString(),
          }),
        });
      }
    } catch (dbErr) {
      console.warn('[ZainCash] Failed to store payment record:', dbErr);
      // Non-fatal — the transaction was created, we just couldn't record it
    }

    return res.status(200).json({
      transactionId: initData.id,
      redirectUrl: redirectUrlFull,
      orderId,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[ZainCash] Create payment error:', message);
    console.error('[ZainCash] Stack:', stack);
    // Return the REAL error message so the caller knows exactly what failed
    return res.status(500).json({
      error: message,
      step: 'create_payment',
    });
  }
}

