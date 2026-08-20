/**
 * POST /api/zaincash/debug-complete-payment
 *
 * DEBUG-ONLY endpoint to complete a ZainCash test payment via the v1 API
 * by directly calling /transaction/processing and /transaction/processingOTP.
 *
 * This endpoint exists ONLY for verifying the integration end-to-end with
 * the documented UAT test wallet. It should be removed before production use,
 * or protected with a debug secret.
 *
 * Request body:
 *   { transactionId: string, phone?: string, pin?: string, otp?: string }
 *
 * Default test wallet (from official ZainCash Laravel package docs):
 *   Phone: 9647802999569
 *   PIN:   1234
 *   OTP:   1111
 *
 * Returns:
 *   { processing: {...}, pay: {...}, finalStatus: {...} }
 */

import crypto from 'crypto';

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

async function callZainCash(endpoint: string, params: Record<string, string>, label: string) {
  const config = getConfig();
  const url = `${config.baseUrl}${endpoint}`;
  const body = new URLSearchParams(params).toString();
  console.log(`[ZainCash Debug ${label}] POST ${url}`);
  console.log(`[ZainCash Debug ${label}] Body:`, body);

  const start = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await response.text();
  const elapsed = Date.now() - start;
  console.log(`[ZainCash Debug ${label}] Status: ${response.status} (${elapsed}ms)`);
  console.log(`[ZainCash Debug ${label}] Body:`, text.slice(0, 1000));

  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* keep as text */ }

  return {
    label,
    url,
    status: response.status,
    statusText: response.statusText,
    body: data,
    rawBody: text.slice(0, 2000),
    elapsedMs: elapsed,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body as {
      transactionId?: string;
      phone?: string;
      pin?: string;
      otp?: string;
    };

    const transactionId = body.transactionId;
    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transactionId' });
    }

    // Defaults = documented UAT test wallet
    const phone = body.phone || '9647802999569';
    const pin   = body.pin   || '1234';
    const otp   = body.otp   || '1111';

    console.log('[ZainCash Debug] Starting complete-payment flow for tx:', transactionId);
    console.log('[ZainCash Debug] Test wallet:', { phone, pin, otp });

    const config = getConfig();

    // ── STEP 1: Initial status check ───────────────────────────────────────
    const now1 = Math.floor(Date.now() / 1000);
    const checkToken1 = createJWT({
      id: transactionId,
      msisdn: config.msisdn,
      iat: now1,
      exp: now1 + 60 * 60 * 4,
    }, config.secret);

    const initialCheck = await callZainCash('/transaction/get', {
      merchantId: config.merchantId,
      token: checkToken1,
    }, 'INITIAL_CHECK');

    // ── STEP 2: Processing (phone + PIN) ────────────────────────────────────
    const processing = await callZainCash('/transaction/processing', {
      id: transactionId,
      phonenumber: phone,
      pin,
    }, 'PROCESSING');

    // Small delay
    await new Promise(r => setTimeout(r, 1000));

    // ── STEP 3: Pay (phone + PIN + OTP) ────────────────────────────────────
    const pay = await callZainCash('/transaction/processingOTP?type=MERCHANT_PAYMENT', {
      id: transactionId,
      phonenumber: phone,
      pin,
      otp,
    }, 'PAY');

    await new Promise(r => setTimeout(r, 1500));

    // ── STEP 4: Final status check ─────────────────────────────────────────
    const now2 = Math.floor(Date.now() / 1000);
    const checkToken2 = createJWT({
      id: transactionId,
      msisdn: config.msisdn,
      iat: now2,
      exp: now2 + 60 * 60 * 4,
    }, config.secret);

    const finalCheck = await callZainCash('/transaction/get', {
      merchantId: config.merchantId,
      token: checkToken2,
    }, 'FINAL_CHECK');

    return res.status(200).json({
      transactionId,
      testWallet: { phone, pin, otp },
      steps: {
        initialCheck,
        processing,
        pay,
        finalCheck,
      },
      summary: {
        initialStatus: (initialCheck.body as { status?: string })?.status ?? 'unknown',
        processingSuccess: (processing.body as { success?: number })?.success ?? 'unknown',
        paySuccess: (pay.body as { success?: number })?.success ?? 'unknown',
        finalStatus: (finalCheck.body as { status?: string })?.status ?? 'unknown',
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ZainCash Debug] Error:', message);
    return res.status(500).json({ error: message });
  }
}
