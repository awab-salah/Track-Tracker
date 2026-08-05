/**
 * GET /api/zaincash/verify?transactionId=xxx
 *
 * Verifies a ZainCash payment by inquiring the transaction status.
 * Used by the client-side to poll for payment completion after redirect.
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

function getConfig() {
  return {
    baseUrl:      process.env.ZAINCASH_BASE_URL      ?? 'https://test.zaincash.iq',
    clientId:     process.env.ZAINCASH_CLIENT_ID      ?? '',
    clientSecret: process.env.ZAINCASH_CLIENT_SECRET  ?? '',
    apiKey:       process.env.ZAINCASH_API_KEY        ?? '',
  };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const config = getConfig();
  const response = await fetch(`${config.baseUrl}/api/v2/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      api_key: config.apiKey,
    }).toString(),
  });
  if (!response.ok) throw new Error(`OAuth2 failed: ${response.status}`);
  const data = await response.json() as { access_token: string; expires_in: number };
  if (!data.access_token) throw new Error('No access_token');
  tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { transactionId } = req.query as { transactionId?: string };

    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transactionId query parameter' });
    }

    const config = getConfig();

    if (!config.clientId || !config.clientSecret || !config.apiKey) {
      return res.status(503).json({ error: 'ZainCash not configured' });
    }

    const token = await getAccessToken();

    const response = await fetch(
      `${config.baseUrl}/api/v2/payment-gateway/transaction/inquiry/${transactionId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('[ZainCash] Inquiry failed:', response.status, text);
      return res.status(502).json({ error: 'Inquiry failed', details: text });
    }

    const details = await response.json();

    return res.status(200).json({
      transactionId,
      status: (details as Record<string, unknown>).status,
      details,
    });

  } catch (err) {
    console.error('[ZainCash] Verify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
