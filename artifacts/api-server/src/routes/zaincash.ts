/**
 * ZainCash Payment Gateway routes for the Express API server.
 *
 * Endpoints:
 *   POST /api/zaincash/create  — Create a payment transaction
 *   POST /api/zaincash/callback — Server-to-server callback from ZainCash
 *   GET  /api/zaincash/verify  — Verify payment status (client polling)
 *
 * Uses ZainCash v1 API (JWT-based authentication).
 *
 * IMPORTANT: The v2 OAuth2 API (/api/v2/oauth2/token and
 * /api/v2/payment-gateway/transaction/init) is behind Cloudflare WAF
 * and returns 403 Forbidden for server-to-server requests from
 * serverless environments. All production ZainCash integrations
 * (Laravel package, Flutter packages) use the v1 JWT flow.
 *
 * v1 Flow:
 *   1. Create JWT payload { amount, serviceType, msisdn, orderId, redirectUrl, iat, exp }
 *   2. Sign with HMAC-SHA256 using the merchant secret key
 *   3. POST to {baseUrl}/transaction/init with { lang, merchantId, token }
 *   4. Response: { id, rUrl } — redirect user to rUrl + id
 *
 * Inquiry (for verify/callback):
 *   1. Create JWT payload { id, msisdn, iat, exp }
 *   2. POST to {baseUrl}/transaction/get with { merchantId, token }
 *
 * Sandbox defaults: official test credentials from the ZainCash Laravel package
 * (https://github.com/waadmawlood/zaincash).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────
//
// ZainCash v1 API uses JWT (HMAC-SHA256) signed with a secret key.
// The merchant is identified by merchantId + msisdn.
//
// Sandbox defaults: official test credentials from the ZainCash Laravel package
// (https://github.com/waadmawlood/zaincash).
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

/**
 * Create a JWT token signed with HMAC-SHA256.
 * Used for both transaction init and inquiry requests.
 */
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

/**
 * Decode a ZainCash callback JWT token (v1).
 * Returns the payload if valid, throws if invalid.
 */
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

// ── Supabase helper ──────────────────────────────────────────────────────────

function getSupabaseCreds() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  return { url, key };
}

// ── Inquiry helper (v1 API) ──────────────────────────────────────────────────

async function inquireTransaction(transactionId: string): Promise<Record<string, unknown>> {
  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    id: transactionId,
    msisdn: config.msisdn,
    iat: now,
    exp: now + 60 * 60 * 4,
  };
  const token = createJWT(jwtPayload, config.secret);

  const inquiryUrl = `${config.baseUrl}/transaction/get`;
  console.log('[ZainCash] Inquiry request to:', inquiryUrl, 'for transaction:', transactionId);

  const response = await fetch(inquiryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchantId: config.merchantId,
      token: encodeURIComponent(token),
    }),
  });

  const responseText = await response.text();
  console.log('[ZainCash] Inquiry response status:', response.status);
  console.log('[ZainCash] Inquiry response body:', responseText);

  if (!response.ok) {
    throw new Error(`ZainCash inquiry failed: ${response.status} — ${responseText.slice(0, 500)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`ZainCash inquiry returned invalid JSON: ${responseText.slice(0, 200)}`);
  }

  if (data.err) {
    throw new Error(`ZainCash inquiry error: ${JSON.stringify(data.err)}`);
  }

  return data;
}

// ── Router ────────────────────────────────────────────────────────────────────

const router: IRouter = Router();

/**
 * POST /api/zaincash/create
 * Create a ZainCash payment transaction using v1 JWT API.
 */
router.post('/zaincash/create', async (req: Request, res: Response) => {
  try {
    const { planId, amount, companyId } = req.body as {
      planId?: string;
      amount?: number;
      companyId?: string;
    };

    if (!planId || !amount || !companyId) {
      return res.status(400).json({ error: 'Missing required fields: planId, amount, companyId' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    const config = getConfig();

    // v1 API requires msisdn + merchantId + secret
    if (!config.msisdn || !config.merchantId || !config.secret) {
      return res.status(503).json({
        error: 'ZainCash payment gateway not configured',
        details: 'Missing required v1 credentials: msisdn, merchantId, or secret key',
      });
    }

    // Generate unique order ID
    const orderId = `tt-${planId}-${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build redirect URL for after payment
    const redirectUrl = config.redirectUrl
      ? `${config.redirectUrl}?orderId=${orderId}&planId=${planId}&companyId=${companyId}`
      : '';

    // ── Step 1: Create JWT token ──────────────────────────────────────────
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

    // ── Step 2: Initiate transaction via v1 API ───────────────────────────
    const initUrl = `${config.baseUrl}/transaction/init`;
    const initBody = {
      lang: config.lang,
      merchantId: config.merchantId,
      token: encodeURIComponent(token),
    };

    console.log('[ZainCash] Initiating transaction at:', initUrl);
    console.log('[ZainCash] Request body keys:', Object.keys(initBody));

    const initResponse = await fetch(initUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initBody),
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
        zaincashResponse: initText.slice(0, 1000),
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
        zaincashResponse: initText.slice(0, 500),
      });
    }

    // Check for error in response body (ZainCash returns { err: { msg } })
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
      const { url: supabaseUrl, key: supabaseKey } = getSupabaseCreds();
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
    // Return the REAL error so the caller knows exactly which step failed
    return res.status(500).json({
      error: message,
      step: 'create_payment',
    });
  }
});

/**
 * POST /api/zaincash/callback
 * Server-to-server callback from ZainCash after payment.
 * Handles both v1 (JWT) and v2 (JSON) callback formats.
 * Always verifies via v1 inquiry API — NEVER trusts the callback payload alone.
 */
router.post('/zaincash/callback', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const config = getConfig();

    let transactionId = '';
    let orderId = '';
    let companyId = '';

    // Handle v1 JWT callback (ZainCash sends { token: "jwt..." })
    if (body.token && typeof body.token === 'string' && config.secret) {
      console.log('[ZainCash] v1 JWT callback received');
      try {
        const payload = decodeJwt(body.token as string, config.secret);
        transactionId = (payload.id ?? payload.transactionId ?? '') as string;
        orderId = (payload.orderId ?? '') as string;
      } catch (jwtErr) {
        console.error('[ZainCash] JWT decode failed:', jwtErr);
      }
    }

    // Handle v2/direct JSON callback (fallback)
    if (!transactionId) {
      console.log('[ZainCash] JSON callback received:', JSON.stringify(body).slice(0, 500));
      transactionId = (body.id ?? body.transactionId ?? '') as string;
      orderId = (body.orderId ?? '') as string;
    }

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transaction ID' });
    }

    // Always verify via inquiry — NEVER trust the callback payload alone
    console.log('[ZainCash] Verifying transaction via inquiry:', transactionId);
    const details = await inquireTransaction(transactionId) as {
      status: string;
      orderId: string;
    };

    const verifiedOrderId = details.orderId || orderId;

    // Extract companyId from orderId (format: tt-{planId}-{companyId}-{timestamp}-{random})
    const parts = verifiedOrderId.split('-');
    if (parts.length >= 4 && parts[0] === 'tt') {
      companyId = parts[2];
    }

    console.log('[ZainCash] Transaction verified:', transactionId, 'status:', details.status, 'companyId:', companyId);

    // Update payment record
    try {
      const { url: supabaseUrl, key: supabaseKey } = getSupabaseCreds();
      if (supabaseUrl && supabaseKey) {
        await fetch(`${supabaseUrl}/rest/v1/payment_records?id=eq.${transactionId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ status: details.status, updated_at: new Date().toISOString() }),
        });
      }
    } catch { /* non-fatal */ }

    // Only activate if payment is COMPLETED
    if (details.status === 'completed' && companyId) {
      try {
        const { url: supabaseUrl, key: supabaseKey } = getSupabaseCreds();
        if (supabaseUrl && supabaseKey) {
          const activateRes = await fetch(`${supabaseUrl}/rest/v1/companies?id=eq.${companyId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ subscription_active: true }),
          });
          if (activateRes.ok) {
            console.log('[ZainCash] Subscription activated for company:', companyId);
          } else {
            const text = await activateRes.text();
            console.error('[ZainCash] Failed to activate subscription:', activateRes.status, text);
          }
        }
      } catch { /* non-fatal */ }
    }

    // Always return 200 to acknowledge the callback
    return res.status(200).json({
      received: true,
      transactionId,
      status: details.status,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ZainCash] Callback error:', message);
    // Return 200 to prevent ZainCash from retrying, but include the real error
    return res.status(200).json({ received: true, error: message });
  }
});

/**
 * GET /api/zaincash/verify?transactionId=xxx
 * Verify payment status using v1 JWT inquiry API.
 */
router.get('/zaincash/verify', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.query as { transactionId?: string };

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transactionId query parameter' });
    }

    const config = getConfig();

    if (!config.msisdn || !config.merchantId || !config.secret) {
      return res.status(503).json({
        error: 'ZainCash not configured',
        details: 'Missing required v1 credentials: msisdn, merchantId, or secret key',
      });
    }

    const details = await inquireTransaction(transactionId);

    return res.status(200).json({
      transactionId,
      status: details.status,
      details,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ZainCash] Verify error:', message);
    return res.status(500).json({
      error: message,
      step: 'verify_payment',
    });
  }
});

export default router;
