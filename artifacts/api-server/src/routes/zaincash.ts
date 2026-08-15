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
    // redirectUrl: In ZainCash v1, this serves dual purpose — redirect + callback.
    // Production default: our callback endpoint that processes the token and redirects.
    redirectUrl: process.env.ZAINCASH_REDIRECT_URL
      ?? 'https://track-tracker-app.vercel.app/api/zaincash/callback',
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

  // ZainCash v1 API requires application/x-www-form-urlencoded, NOT JSON
  const inquiryParams = new URLSearchParams();
  inquiryParams.append('merchantId', config.merchantId);
  inquiryParams.append('token', token);

  const response = await fetch(inquiryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: inquiryParams.toString(),
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

    // Build redirectUrl for the JWT payload.
    // In ZainCash v1, redirectUrl serves as BOTH user redirect and callback:
    //   - After payment, ZainCash redirects the user's browser to redirectUrl?token=XXXXX
    //   - The token JWT contains the payment result (status, orderId, id)
    // We append orderId/planId/companyId as query params so the callback endpoint
    // can use them as fallback if the token doesn't contain enough info.
    const redirectUrl = `${config.redirectUrl}?orderId=${orderId}&planId=${planId}&companyId=${companyId}`;

    // ── Step 1: Create JWT token ──────────────────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      amount,
      serviceType: 'subscription',
      msisdn: config.msisdn,
      orderId,
      redirectUrl,  // ZainCash v1 callback: browser redirect to this URL + ?token=XXXXX
      iat: now,
      exp: now + 60 * 60 * 4, // 4 hours expiry
    };

    const token = createJWT(jwtPayload, config.secret);
    console.log('[ZainCash] JWT token created for order:', orderId);

    // ── Step 2: Initiate transaction via v1 API ───────────────────────────
    // ZainCash v1 API requires application/x-www-form-urlencoded, NOT JSON
    const initUrl = `${config.baseUrl}/transaction/init`;
    const initParams = new URLSearchParams();
    initParams.append('token', token);
    initParams.append('merchantId', config.merchantId);
    initParams.append('lang', config.lang);

    console.log('[ZainCash] Initiating transaction at:', initUrl);
    console.log('[ZainCash] Content-Type: application/x-www-form-urlencoded');

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

// ── HTML redirect page (for GET callback) ─────────────────────────────────────
// After processing the GET callback, redirect the user to the subscriptions page.

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

// ── Core callback processing (shared by GET and POST) ─────────────────────────

async function processCallback(params: {
  transactionId: string;
  orderId?: string;
  planId?: string;
  companyId?: string;
}): Promise<{ success: boolean; transactionId: string; status: string; message: string }> {
  const { transactionId } = params;

  if (!transactionId) {
    return { success: false, transactionId: '', status: 'invalid', message: 'Missing transaction ID' };
  }

  let companyId = params.companyId ?? '';

  // ── Idempotency check: if payment already completed, skip ──────────────
  try {
    const { url: supabaseUrl, key: supabaseKey } = getSupabaseCreds();
    if (supabaseUrl && supabaseKey) {
      const recordRes = await fetch(
        `${supabaseUrl}/rest/v1/payment_records?id=eq.${transactionId}&select=status,company_id`,
        { method: 'GET', headers: { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
      );
      if (recordRes.ok) {
        const rows = await recordRes.json() as Array<{ status: string; company_id: string }>;
        if (rows.length > 0) {
          if (rows[0].status === 'completed') {
            console.log('[ZainCash] Callback: payment already completed (idempotent):', transactionId);
            return { success: true, transactionId, status: 'completed', message: 'Already processed' };
          }
          // Use company_id from payment_records (most reliable)
          if (!companyId && rows[0].company_id) {
            companyId = rows[0].company_id;
          }
        }
      }
    }
  } catch { /* non-fatal — continue without idempotency check */ }

  // Always verify via inquiry — NEVER trust the callback payload alone
  console.log('[ZainCash] Verifying transaction via inquiry:', transactionId);
  const details = await inquireTransaction(transactionId) as {
    status: string;
    orderId: string;
  };

  // Use companyId from payment_records (already set above) or fallback
  if (!companyId) {
    try {
      const { url: supabaseUrl, key: supabaseKey } = getSupabaseCreds();
      if (supabaseUrl && supabaseKey) {
        const recordRes = await fetch(
          `${supabaseUrl}/rest/v1/payment_records?id=eq.${transactionId}&select=company_id`,
          { method: 'GET', headers: { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
        );
        if (recordRes.ok) {
          const rows = await recordRes.json() as Array<{ company_id: string }>;
          if (rows.length > 0 && rows[0].company_id) companyId = rows[0].company_id;
        }
      }
    } catch { /* non-fatal */ }
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

  return {
    success: details.status === 'completed',
    transactionId,
    status: details.status,
    message: details.status === 'completed' ? 'Payment completed' : `Payment status: ${details.status}`,
  };
}

/**
 * GET /api/zaincash/callback
 *
 * ZainCash v1 redirect callback. After payment, ZainCash redirects the
 * user's browser to redirectUrl?token=XXXXX. The token is a JWT containing
 * { status, orderid, id, iat, exp }.
 *
 * This is the PRIMARY callback mechanism in ZainCash v1.
 * Also handles the case where user cancels (no token in URL).
 */
router.get('/zaincash/callback', async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string) ?? '';
    const orderId = (req.query.orderId as string) ?? '';
    const planId = (req.query.planId as string) ?? '';
    const companyId = (req.query.companyId as string) ?? '';

    // No token = user cancelled payment (ZainCash redirects without token on cancel)
    if (!token) {
      console.log('[ZainCash] GET callback without token — payment cancelled by user');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(redirectPage('cancelled', false));
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
      return res.status(400).send(redirectPage('invalid', false));
    }

    if (!transactionId) {
      console.error('[ZainCash] GET callback: no transactionId in token');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(400).send(redirectPage('invalid', false));
    }

    // Process the callback
    const result = await processCallback({ transactionId, orderId, planId, companyId });

    // Return an HTML page that auto-redirects to /subscriptions
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(redirectPage(result.status, result.success));

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ZainCash] GET callback error:', message);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(redirectPage('error', false));
  }
});

/**
 * POST /api/zaincash/callback
 * ZainCash v1 redirect callback or potential v2 server-to-server callback.
 * Handles both v1 (JWT in body.token) and v2 (JSON body) callback formats.
 * Always verifies via v1 inquiry API — NEVER trusts the callback payload alone.
 * Idempotent: if payment already completed, skips activation.
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
        return res.status(400).json({ error: 'Invalid JWT token', received: false });
      }
    }

    // Handle v2/direct JSON callback (fallback)
    if (!transactionId) {
      console.log('[ZainCash] JSON callback received:', JSON.stringify(body).slice(0, 500));
      transactionId = (body.id ?? body.transactionId ?? '') as string;
      orderId = (body.orderId ?? '') as string;
      companyId = (body.companyId ?? '') as string;
    }

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transaction ID', received: false });
    }

    // Process using shared callback logic
    const result = await processCallback({ transactionId, orderId, companyId });


    return res.status(200).json({
      received: true,
      transactionId: result.transactionId,
      status: result.status,
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
