/**
 * ZainCash Payment Gateway routes for the Express API server.
 *
 * Endpoints:
 *   POST /api/zaincash/create  — Create a payment transaction
 *   POST /api/zaincash/callback — Server-to-server callback from ZainCash
 *   GET  /api/zaincash/verify  — Verify payment status (client polling)
 *
 * Uses the official ZainCash v2 API with OAuth2 client_credentials grant.
 * Sandbox credentials are embedded as defaults from docs.zaincash.iq.
 * Switch to production by setting environment variables — no code changes needed.
 */
import { Router, type IRouter, type Request, type Response } from "express";

// ── Config ────────────────────────────────────────────────────────────────────
//
// ZainCash v2 API uses OAuth2 (client_id + client_secret).
// The merchant is identified by the OAuth2 token — merchantId/msisdn are
// v1 legacy fields and optional in v2.
//
// Sandbox defaults: official test credentials from docs.zaincash.iq
// (also referenced in the pub.dev zaincash_payment package).

const SANDBOX_DEFAULTS = {
  baseUrl:      'https://test.zaincash.iq',
  clientId:     '758055f4a8044779a35f6ceb69f858b3',
  clientSecret: 'bibLCGTxVAig5To3OLLKPJQMlRR7Pefp',
};

function getConfig() {
  return {
    baseUrl:      process.env.ZAINCASH_BASE_URL      || SANDBOX_DEFAULTS.baseUrl,
    clientId:     process.env.ZAINCASH_CLIENT_ID      || SANDBOX_DEFAULTS.clientId,
    clientSecret: process.env.ZAINCASH_CLIENT_SECRET  || SANDBOX_DEFAULTS.clientSecret,
    apiKey:       process.env.ZAINCASH_API_KEY        ?? '',
    merchantId:   process.env.ZAINCASH_MERCHANT_ID    ?? '',
    secretKey:    process.env.ZAINCASH_SECRET_KEY     ?? '',
    msisdn:       process.env.ZAINCASH_MSISDN         ?? '',
    callbackUrl:  process.env.ZAINCASH_CALLBACK_URL   ?? '',
    redirectUrl:  process.env.ZAINCASH_REDIRECT_URL   ?? '',
    lang:         process.env.ZAINCASH_LANG           ?? 'ar',
  };
}

// ── OAuth2 ────────────────────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const config = getConfig();
  const tokenUrl = `${config.baseUrl}/api/v2/oauth2/token`;

  const params: Record<string, string> = {
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  };
  if (config.apiKey) params.api_key = config.apiKey;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    // Detect Cloudflare challenge (common with test.zaincash.iq from serverless)
    if (text.includes('Cloudflare') || text.includes('Attention Required')) {
      throw new Error('ZainCash API is currently protected by Cloudflare — the OAuth2 request was blocked. This typically affects serverless environments. Try again later or contact ZainCash support to whitelist your server IP.');
    }
    throw new Error(`ZainCash OAuth2 failed: ${response.status} — ${text.slice(0, 200)}`);
  }

  let data: { access_token: string; expires_in: number };
  try {
    data = await response.json() as { access_token: string; expires_in: number };
  } catch {
    throw new Error('ZainCash OAuth2 returned non-JSON response — API may be protected by Cloudflare');
  }
  if (!data.access_token) throw new Error('No access_token in OAuth2 response');

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return data.access_token;
}

// ── Supabase helper ──────────────────────────────────────────────────────────

function getSupabaseCreds() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  return { url, key };
}

// ── Router ────────────────────────────────────────────────────────────────────

const router: IRouter = Router();

/**
 * POST /api/zaincash/create
 * Create a ZainCash payment transaction and return the redirect URL.
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

    // Check ZainCash is configured (v2 API requires clientId + clientSecret for OAuth2)
    if (!config.clientId || !config.clientSecret) {
      return res.status(503).json({ error: 'ZainCash payment gateway not configured' });
    }

    // Get OAuth2 token
    const token = await getAccessToken();

    // Generate unique order ID
    const orderId = `tt-${planId}-${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Initiate transaction
    const initUrl = `${config.baseUrl}/api/v2/payment-gateway/transaction/init`;

    // Build v2 transaction init body.
    // merchantId and msisdn are v1 fields — include only if set.
    const initBody: Record<string, unknown> = {
      amount,
      serviceType: 'subscription',
      orderId,
      redirectUrl: config.redirectUrl
        ? `${config.redirectUrl}?orderId=${orderId}&planId=${planId}&companyId=${companyId}`
        : '',
      lang: config.lang,
    };
    if (config.merchantId) initBody.merchantId = config.merchantId;
    if (config.msisdn)     initBody.msisdn = config.msisdn;
    if (config.callbackUrl) initBody.callbackUrl = config.callbackUrl;

    const initResponse = await fetch(initUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(initBody),
    });

    if (!initResponse.ok) {
      const text = await initResponse.text();
      return res.status(502).json({ error: 'ZainCash transaction init failed', details: text });
    }

    const initData = await initResponse.json() as { id: string; redirectionURL: string };

    if (!initData.id || !initData.redirectionURL) {
      return res.status(502).json({ error: 'Invalid ZainCash response' });
    }

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
    } catch { /* non-fatal */ }

    return res.status(200).json({
      transactionId: initData.id,
      redirectUrl: initData.redirectionURL,
      orderId,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: 'Internal server error', details: message });
  }
});

/**
 * POST /api/zaincash/callback
 * Server-to-server callback from ZainCash after payment.
 */
router.post('/zaincash/callback', async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const config = getConfig();

    let transactionId = '';
    let orderId = '';
    let companyId = '';

    // Handle v2 JSON callback
    transactionId = (body.id ?? body.transactionId ?? '') as string;
    orderId = (body.orderId ?? '') as string;

    // Handle v1 JWT callback (if secretKey is configured)
    if (!transactionId && body.token && typeof body.token === 'string' && config.secretKey) {
      try {
        const crypto = await import('crypto');
        const parts = (body.token as string).split('.');
        if (parts.length === 3) {
          const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf-8');
          const payload = JSON.parse(payloadJson);
          transactionId = (payload.id ?? payload.transactionId ?? '') as string;
          orderId = (payload.orderId ?? '') as string;
        }
      } catch { /* JWT decode failed, use v2 fields */ }
    }

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transaction ID' });
    }

    // Always verify via inquiry — NEVER trust the callback payload alone
    const token = await getAccessToken();
    const inquiryUrl = `${config.baseUrl}/api/v2/payment-gateway/transaction/inquiry/${transactionId}`;

    const inquiryResponse = await fetch(inquiryUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!inquiryResponse.ok) {
      const text = await inquiryResponse.text();
      // Still acknowledge the callback
      return res.status(200).json({ received: true, error: 'Inquiry failed' });
    }

    const details = await inquiryResponse.json() as {
      status: string;
      orderId: string;
    };

    const verifiedOrderId = details.orderId || orderId;

    // Extract companyId from orderId (format: tt-{planId}-{companyId}-{timestamp}-{random})
    const parts = verifiedOrderId.split('-');
    if (parts.length >= 4 && parts[0] === 'tt') {
      companyId = parts[2];
    }

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
          await fetch(`${supabaseUrl}/rest/v1/companies?id=eq.${companyId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ subscription_active: true }),
          });
        }
      } catch { /* non-fatal */ }
    }

    // Always return 200 to acknowledge the callback
    return res.status(200).json({
      received: true,
      transactionId,
      status: details.status,
    });

  } catch {
    // Return 200 to prevent ZainCash from retrying
    return res.status(200).json({ received: true, error: 'Processing failed' });
  }
});

/**
 * GET /api/zaincash/verify?transactionId=xxx
 * Verify payment status (client polling after redirect).
 */
router.get('/zaincash/verify', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.query as { transactionId?: string };

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transactionId query parameter' });
    }

    const config = getConfig();

    if (!config.clientId || !config.clientSecret) {
      return res.status(503).json({ error: 'ZainCash not configured' });
    }

    const token = await getAccessToken();

    const response = await fetch(
      `${config.baseUrl}/api/v2/payment-gateway/transaction/inquiry/${transactionId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: 'Inquiry failed', details: text });
    }

    const details = await response.json();

    return res.status(200).json({
      transactionId,
      status: (details as Record<string, unknown>).status,
      details,
    });

  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
