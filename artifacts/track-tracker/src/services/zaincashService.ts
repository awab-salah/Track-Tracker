/**
 * ZainCash Payment Gateway Service
 *
 * Implements the ZainCash Payment Gateway v1 API (JWT-based):
 *   1. JWT token creation (HMAC-SHA256 signed)
 *   2. Transaction initialization → redirect URL
 *   3. Callback JWT verification
 *   4. Transaction inquiry (status verification)
 *
 * IMPORTANT: The v2 OAuth2 API (/api/v2/oauth2/token and
 * /api/v2/payment-gateway/transaction/init) is behind Cloudflare WAF
 * and returns 403 for server-to-server requests. All production
 * ZainCash integrations use the v1 JWT flow.
 *
 * All credentials come from environment variables — no hardcoding.
 * Switching from Sandbox to Production requires ONLY changing env vars.
 *
 * Environment Variables:
 *   ZAINCASH_BASE_URL       - API base URL (sandbox or production)
 *   ZAINCASH_MERCHANT_ID    - Merchant ID
 *   ZAINCASH_SECRET_KEY     - JWT secret for encoding/decoding tokens
 *   ZAINCASH_MSISDN         - Merchant wallet phone number (e.g. 964780xxxxxxx)
 *   ZAINCASH_CALLBACK_URL   - URL ZainCash calls after payment
 *   ZAINCASH_REDIRECT_URL   - URL to redirect user after payment
 *   ZAINCASH_LANG           - Language for payment page (ar or en)
 */

// ── Configuration ────────────────────────────────────────────────────────────
//
// ZainCash v1 API uses JWT (HMAC-SHA256) signed with a secret key.
// Sandbox defaults: official test credentials from the ZainCash Laravel package
// (https://github.com/waadmawlood/zaincash).
// Switch to production by setting env vars — no code changes needed.

const SANDBOX_DEFAULTS = {
  baseUrl:    'https://test.zaincash.iq',
  msisdn:     '9647835077893',
  merchantId: '5ffacf6612b5777c6d44266f',
  secret:     '$2y$10$hBbAZo2GfSSvyqAyV2SaqOfYewgYpfR1O19gIh4SqyGWdmySZYPuS',
};

export interface ZainCashConfig {
  baseUrl: string;
  msisdn: string;
  merchantId: string;
  secretKey: string;
  callbackUrl: string;
  redirectUrl: string;
  lang: 'ar' | 'en';
}

export function getZainCashConfig(): ZainCashConfig {
  return {
    baseUrl:     process.env.ZAINCASH_BASE_URL     || SANDBOX_DEFAULTS.baseUrl,
    msisdn:      process.env.ZAINCASH_MSISDN        || SANDBOX_DEFAULTS.msisdn,
    merchantId:  process.env.ZAINCASH_MERCHANT_ID   || SANDBOX_DEFAULTS.merchantId,
    secretKey:   process.env.ZAINCASH_SECRET_KEY    || SANDBOX_DEFAULTS.secret,
    callbackUrl: process.env.ZAINCASH_CALLBACK_URL  ?? '',
    redirectUrl: process.env.ZAINCASH_REDIRECT_URL  ?? '',
    lang:        (process.env.ZAINCASH_LANG as 'ar' | 'en') ?? 'ar',
  };
}

export function isZainCashConfigured(): boolean {
  const c = getZainCashConfig();
  // v1 API requires msisdn + merchantId + secret
  return !!(c.msisdn && c.merchantId && c.secretKey);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ZainCashInitResponse {
  id: string;           // Transaction ID
  rUrl: string;         // Base redirect URL (append transaction ID)
}

export interface ZainCashTransactionDetails {
  id: string;
  status: ZainCashTransactionStatus;
  amount: number;
  serviceType: string;
  orderId: string;
  createdAt: string;
  updatedAt: string;
}

export enum ZainCashTransactionStatus {
  PENDING    = 'pending',
  PROCESSING = 'processing',
  COMPLETED  = 'completed',
  FAILED     = 'failed',
  REVERSED   = 'reversed',
}

export interface ZainCashCallbackPayload {
  orderId: string;
  status: string;
  amount: number;
  transactionId: string;
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
export function createJWT(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const crypto = require('crypto');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${headerB64}.${payloadB64}.${signature}`;
}

// ── Initialize Transaction ───────────────────────────────────────────────────

/**
 * Create a new ZainCash payment transaction (v1 API).
 * Returns the transaction ID and the redirect URL.
 */
export async function initiatePayment(params: {
  amount: number;
  orderId: string;
  serviceType?: string;
}): Promise<{ id: string; redirectUrl: string }> {
  const config = getZainCashConfig();

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    amount: params.amount,
    serviceType: params.serviceType ?? 'subscription',
    msisdn: config.msisdn,
    orderId: params.orderId,
    redirectUrl: config.redirectUrl,
    iat: now,
    exp: now + 60 * 60 * 4,
  };

  const token = createJWT(jwtPayload, config.secretKey);

  const initUrl = `${config.baseUrl}/transaction/init`;

  // ZainCash v1 API requires application/x-www-form-urlencoded, NOT JSON
  const initParams = new URLSearchParams();
  initParams.append('token', token);
  initParams.append('merchantId', config.merchantId);
  initParams.append('lang', config.lang);

  console.log('[ZainCash] Initiating transaction at:', initUrl);
  console.log('[ZainCash] Content-Type: application/x-www-form-urlencoded');
  console.log('[ZainCash] JWT payload:', JSON.stringify(jwtPayload));
  console.log('[ZainCash] msisdn type:', typeof jwtPayload.msisdn, '| value:', jwtPayload.msisdn);

  const response = await fetch(initUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: initParams.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[ZainCash] Transaction init failed:', response.status, text);
    throw new Error(`ZainCash transaction init failed: ${response.status} — ${text}`);
  }

  const data = (await response.json()) as ZainCashInitResponse;

  if (!data.id) {
    throw new Error('ZainCash transaction init: missing id in response');
  }

  const redirectUrl = data.rUrl
    ? `${data.rUrl}${data.id}`
    : `${config.baseUrl}/transaction/pay?id=${data.id}`;

  console.log('[ZainCash] Transaction created:', data.id, '→ redirect to:', redirectUrl);
  return { id: data.id, redirectUrl };
}

// ── Verify Transaction ───────────────────────────────────────────────────────

/**
 * Query the status of a ZainCash transaction (v1 API).
 */
export async function inquireTransaction(transactionId: string): Promise<ZainCashTransactionDetails> {
  const config = getZainCashConfig();

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    id: transactionId,
    msisdn: config.msisdn,
    iat: now,
    exp: now + 60 * 60 * 4,
  };
  const token = createJWT(jwtPayload, config.secretKey);

  const inquiryUrl = `${config.baseUrl}/transaction/get`;

  console.log('[ZainCash] Inquiring transaction:', transactionId);

  // ZainCash v1 API requires application/x-www-form-urlencoded, NOT JSON
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
    console.error('[ZainCash] Transaction inquiry failed:', response.status, text);
    throw new Error(`ZainCash inquiry failed: ${response.status} — ${text}`);
  }

  const data = (await response.json()) as ZainCashTransactionDetails;

  console.log('[ZainCash] Transaction status:', data.id, '→', data.status);
  return data;
}

/**
 * Verify a transaction is completed (paid successfully).
 */
export async function verifyPaymentCompleted(transactionId: string): Promise<ZainCashTransactionDetails> {
  const details = await inquireTransaction(transactionId);

  if (details.status !== ZainCashTransactionStatus.COMPLETED) {
    throw new Error(`ZainCash payment not completed. Status: ${details.status}`);
  }

  return details;
}

// ── Callback JWT Decoding ─────────────────────────────────────────────────────

/**
 * Decode a ZainCash callback JWT token.
 * Returns the payload if valid, throws if invalid.
 */
export function decodeCallbackToken(token: string): ZainCashCallbackPayload {
  const config = getZainCashConfig();
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format: expected 3 parts');
  }

  const payloadB64 = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf-8');

  let payload: ZainCashCallbackPayload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    throw new Error('Invalid JWT payload: not valid JSON');
  }

  const crypto = require('crypto');
  const signature = crypto
    .createHmac('sha256', config.secretKey)
    .update(`${parts[0]}.${parts[1]}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== parts[2]) {
    throw new Error('Invalid JWT signature: verification failed');
  }

  console.log('[ZainCash] Callback token decoded successfully:', payload);
  return payload;
}
