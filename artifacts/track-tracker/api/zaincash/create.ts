/**
 * POST /api/zaincash/create
 *
 * Creates a ZainCash payment transaction and returns the redirect URL.
 *
 * Request body:
 *   { planId: string, amount: number, companyId: string }
 *
 * Response:
 *   { transactionId: string, redirectUrl: string }
 */

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

// We inline the service logic here since Vercel serverless functions
// don't share the Vite/src path. This keeps it self-contained.

// ── Config ────────────────────────────────────────────────────────────────────

function getConfig() {
  return {
    baseUrl:      process.env.ZAINCASH_BASE_URL      ?? 'https://test.zaincash.iq',
    clientId:     process.env.ZAINCASH_CLIENT_ID      ?? '',
    clientSecret: process.env.ZAINCASH_CLIENT_SECRET  ?? '',
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

  console.log('[ZainCash] Requesting OAuth2 token...');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      api_key: config.apiKey,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[ZainCash] OAuth2 failed:', response.status, text);
    throw new Error(`OAuth2 failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  if (!data.access_token) throw new Error('No access_token in OAuth2 response');

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  console.log('[ZainCash] OAuth2 token acquired');
  return data.access_token;
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

    // Check ZainCash is configured
    if (!config.clientId || !config.clientSecret || !config.apiKey || !config.merchantId) {
      console.error('[ZainCash] Not configured — missing credentials');
      return res.status(503).json({ error: 'ZainCash payment gateway not configured' });
    }

    // Get OAuth2 token
    const token = await getAccessToken();

    // Generate unique order ID
    const orderId = `tt-${planId}-${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Initiate transaction
    const initUrl = `${config.baseUrl}/api/v2/payment-gateway/transaction/init`;

    const initBody = {
      amount,
      serviceType: 'subscription',
      msisdn: config.msisdn,
      orderId,
      redirectUrl: `${config.redirectUrl}?orderId=${orderId}&planId=${planId}&companyId=${companyId}`,
      callbackUrl: config.callbackUrl,
      lang: config.lang,
      merchantId: config.merchantId,
    };

    console.log('[ZainCash] Initiating transaction for order:', orderId);

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
      console.error('[ZainCash] Init failed:', initResponse.status, text);
      return res.status(502).json({ error: 'ZainCash transaction init failed', details: text });
    }

    const initData = await initResponse.json() as { id: string; redirectionURL: string };

    if (!initData.id || !initData.redirectionURL) {
      console.error('[ZainCash] Invalid init response:', initData);
      return res.status(502).json({ error: 'Invalid ZainCash response' });
    }

    console.log('[ZainCash] Transaction created:', initData.id, 'for order:', orderId);

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
      redirectUrl: initData.redirectionURL,
      orderId,
    });

  } catch (err) {
    console.error('[ZainCash] Create payment error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
