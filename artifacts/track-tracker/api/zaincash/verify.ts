/**
 * GET /api/zaincash/verify?transactionId=xxx
 *
 * Verifies a ZainCash payment by checking the transaction status.
 * Used by the client-side to poll for payment completion after redirect.
 *
 * Uses v1 API: POST /transaction/get with JWT token.
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

    if (!config.msisdn || !config.merchantId || !config.secret) {
      return res.status(503).json({
        error: 'ZainCash not configured',
        details: 'Missing required credentials: msisdn, merchantId, or secret key',
      });
    }

    // Create JWT for inquiry
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      id: transactionId,
      msisdn: config.msisdn,
      iat: now,
      exp: now + 60 * 60 * 4,
    };
    const token = createJWT(jwtPayload, config.secret);

    console.log('[ZainCash] Verify: requesting inquiry for transaction:', transactionId);

    // v1 API: POST /transaction/get
    const inquiryUrl = `${config.baseUrl}/transaction/get`;
    const response = await fetch(inquiryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: config.merchantId,
        token: encodeURIComponent(token),
      }),
    });

    const responseText = await response.text();
    console.log('[ZainCash] Verify: inquiry response status:', response.status);
    console.log('[ZainCash] Verify: inquiry response body:', responseText);

    if (!response.ok) {
      console.error('[ZainCash] Verify: inquiry failed:', response.status, responseText);
      return res.status(502).json({
        error: 'Inquiry failed',
        step: 'transaction_inquiry',
        zaincashStatus: response.status,
        zaincashResponse: responseText,
      });
    }

    let details: Record<string, unknown>;
    try {
      details = JSON.parse(responseText);
    } catch {
      return res.status(502).json({
        error: 'Invalid JSON from ZainCash inquiry',
        step: 'transaction_inquiry',
        zaincashResponse: responseText,
      });
    }

    // Check for error in response
    if (details.err) {
      return res.status(502).json({
        error: 'ZainCash inquiry error',
        step: 'transaction_inquiry',
        zaincashError: details.err,
      });
    }

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
}
