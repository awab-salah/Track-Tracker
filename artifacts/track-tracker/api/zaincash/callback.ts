/**
 * POST /api/zaincash/callback
 *
 * ZainCash server-to-server callback after payment completion.
 * Verifies the payment via inquiry and activates the subscription if successful.
 *
 * Handles both v1 (JWT in body.token) and v2 (JSON body) callback formats.
 * Always verifies via v1 inquiry API — NEVER trusts the callback payload alone.
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

async function updatePaymentRecord(transactionId: string, status: string) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  await fetch(`${supabaseUrl}/rest/v1/payment_records?id=eq.${transactionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
}

async function activateSubscription(companyId: string): Promise<boolean> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return false;

  const res = await fetch(`${supabaseUrl}/rest/v1/companies?id=eq.${companyId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ subscription_active: true }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[ZainCash] Failed to activate subscription:', res.status, text);
    return false;
  }
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body as Record<string, unknown>;
    const config = getConfig();

    let transactionId = '';
    let orderId = '';
    let companyId = '';

    // Handle v1 JWT callback (ZainCash sends { token: "jwt..." })
    if (body.token && typeof body.token === 'string') {
      console.log('[ZainCash] v1 JWT callback received');
      const payload = decodeJwt(body.token as string, config.secret);
      transactionId = (payload.id ?? payload.transactionId ?? '') as string;
      orderId = (payload.orderId ?? '') as string;
    } else {
      // Handle v2/direct JSON callback
      console.log('[ZainCash] JSON callback received:', JSON.stringify(body));
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

    // Use orderId from inquiry (more reliable)
    const verifiedOrderId = details.orderId || orderId;

    // Extract companyId from orderId (format: tt-{planId}-{companyId}-{timestamp}-{random})
    const parts = verifiedOrderId.split('-');
    if (parts.length >= 4 && parts[0] === 'tt') {
      companyId = parts[2];
    }

    console.log('[ZainCash] Transaction verified:', transactionId, 'status:', details.status, 'companyId:', companyId);

    // Update payment record
    await updatePaymentRecord(transactionId, details.status);

    // Only activate if payment is COMPLETED
    if (details.status === 'completed' && companyId) {
      const activated = await activateSubscription(companyId);
      if (activated) {
        console.log('[ZainCash] Subscription activated for company:', companyId);
      } else {
        console.error('[ZainCash] Failed to activate subscription for company:', companyId);
      }
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
}
