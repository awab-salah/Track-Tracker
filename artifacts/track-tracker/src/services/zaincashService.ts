/**
 * ZainCash Payment Gateway Service
 *
 * Implements the complete ZainCash Payment Gateway API v2 flow:
 *   1. OAuth2 token acquisition (client_credentials grant)
 *   2. Transaction initialization → redirect URL
 *   3. Callback JWT verification
 *   4. Transaction inquiry (status verification)
 *
 * All credentials come from environment variables — no hardcoding.
 * Switching from Sandbox to Production requires ONLY changing env vars.
 *
 * Environment Variables:
 *   ZAINCASH_BASE_URL       - API base URL (sandbox or production)
 *   ZAINCASH_CLIENT_ID      - OAuth2 client ID
 *   ZAINCASH_CLIENT_SECRET  - OAuth2 client secret
 *   ZAINCASH_API_KEY        - Merchant API key
 *   ZAINCASH_MERCHANT_ID    - Merchant ID
 *   ZAINCASH_SECRET_KEY     - JWT secret for encoding/decoding tokens
 *   ZAINCASH_MSISDN         - Merchant wallet phone number (e.g. 964780xxxxxxx)
 *   ZAINCASH_CALLBACK_URL   - URL ZainCash calls after payment
 *   ZAINCASH_REDIRECT_URL   - URL to redirect user after payment
 *   ZAINCASH_LANG           - Language for payment page (ar or en)
 */

// ── Configuration ────────────────────────────────────────────────────────────

export interface ZainCashConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  apiKey: string;
  merchantId: string;
  secretKey: string;
  msisdn: string;
  callbackUrl: string;
  redirectUrl: string;
  lang: 'ar' | 'en';
}

export function getZainCashConfig(): ZainCashConfig {
  return {
    baseUrl:     process.env.ZAINCASH_BASE_URL     ?? 'https://test.zaincash.iq',
    clientId:    process.env.ZAINCASH_CLIENT_ID     ?? '',
    clientSecret:process.env.ZAINCASH_CLIENT_SECRET ?? '',
    apiKey:      process.env.ZAINCASH_API_KEY       ?? '',
    merchantId:  process.env.ZAINCASH_MERCHANT_ID   ?? '',
    secretKey:   process.env.ZAINCASH_SECRET_KEY    ?? '',
    msisdn:      process.env.ZAINCASH_MSISDN        ?? '',
    callbackUrl: process.env.ZAINCASH_CALLBACK_URL  ?? '',
    redirectUrl: process.env.ZAINCASH_REDIRECT_URL  ?? '',
    lang:        (process.env.ZAINCASH_LANG as 'ar' | 'en') ?? 'ar',
  };
}

export function isZainCashConfigured(): boolean {
  const c = getZainCashConfig();
  return !!(c.clientId && c.clientSecret && c.apiKey && c.merchantId && c.secretKey && c.msisdn);
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ZainCashTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ZainCashInitRequest {
  amount: number;       // Amount in IQD fils (1 IQD = 1000 fils) — actually IQD as integer
  serviceType: string;  // e.g. "subscription"
  orderId: string;      // Your internal order/subscription ID
  redirectUrl: string;  // URL to redirect after payment
  callbackUrl: string;  // URL ZainCash calls server-to-server
  lang: 'ar' | 'en';
}

export interface ZainCashInitResponse {
  id: string;           // Transaction ID
  redirectionURL: string;  // URL to redirect user to ZainCash payment page
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
  PENDING   = 'pending',
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

// ── OAuth2 Token ─────────────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Get an OAuth2 access token using client_credentials grant.
 * Caches the token until 60 seconds before expiry.
 */
export async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const config = getZainCashConfig();
  const tokenUrl = `${config.baseUrl}/api/v2/oauth2/token`;

  console.log('[ZainCash] Requesting OAuth2 token from:', tokenUrl);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      api_key: config.apiKey,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[ZainCash] OAuth2 token request failed:', response.status, text);
    throw new Error(`ZainCash OAuth2 failed: ${response.status} — ${text}`);
  }

  const data = (await response.json()) as ZainCashTokenResponse;

  if (!data.access_token) {
    throw new Error('ZainCash OAuth2: no access_token in response');
  }

  // Cache with 60s safety margin
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  console.log('[ZainCash] OAuth2 token acquired, expires in', data.expires_in, 'seconds');
  return data.access_token;
}

// ── Initialize Transaction ───────────────────────────────────────────────────

/**
 * Create a new ZainCash payment transaction.
 * Returns the transaction ID and the URL to redirect the user to.
 */
export async function initiatePayment(params: {
  amount: number;
  orderId: string;
  serviceType?: string;
}): Promise<ZainCashInitResponse> {
  const config = getZainCashConfig();
  const token = await getAccessToken();

  const initUrl = `${config.baseUrl}/api/v2/payment-gateway/transaction/init`;

  const body = {
    amount: params.amount,
    serviceType: params.serviceType ?? 'subscription',
    msisdn: config.msisdn,
    orderId: params.orderId,
    redirectUrl: config.redirectUrl,
    callbackUrl: config.callbackUrl,
    lang: config.lang,
    merchantId: config.merchantId,
  };

  console.log('[ZainCash] Initiating transaction:', JSON.stringify({ ...body, msisdn: '***' }));

  const response = await fetch(initUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[ZainCash] Transaction init failed:', response.status, text);
    throw new Error(`ZainCash transaction init failed: ${response.status} — ${text}`);
  }

  const data = (await response.json()) as ZainCashInitResponse;

  if (!data.id || !data.redirectionURL) {
    throw new Error('ZainCash transaction init: missing id or redirectionURL in response');
  }

  console.log('[ZainCash] Transaction created:', data.id, '→ redirect to:', data.redirectionURL);
  return data;
}

// ── Verify Transaction ───────────────────────────────────────────────────────

/**
 * Query the status of a ZainCash transaction.
 * Returns full transaction details.
 */
export async function inquireTransaction(transactionId: string): Promise<ZainCashTransactionDetails> {
  const config = getZainCashConfig();
  const token = await getAccessToken();

  const inquiryUrl = `${config.baseUrl}/api/v2/payment-gateway/transaction/inquiry/${transactionId}`;

  console.log('[ZainCash] Inquiring transaction:', transactionId);

  const response = await fetch(inquiryUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
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
 * Throws if the transaction is not in COMPLETED status.
 */
export async function verifyPaymentCompleted(transactionId: string): Promise<ZainCashTransactionDetails> {
  const details = await inquireTransaction(transactionId);

  if (details.status !== ZainCashTransactionStatus.COMPLETED) {
    throw new Error(`ZainCash payment not completed. Status: ${details.status}`);
  }

  return details;
}

// ── Callback JWT Decoding (Legacy v1 compatible) ─────────────────────────────
//
// ZainCash v1 sends a JWT token in the callback. We decode it using the
// merchant secret key (HMAC-SHA256). The payload contains orderId, status,
// amount, and transactionId.
//
// For v2, the callback may use a different format, but we handle both.

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

  // Decode payload (base64url)
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

  // Verify signature using HMAC-SHA256
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
