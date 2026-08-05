/**
 * POST /api/zaincash/callback
 *
 * ZainCash server-to-server callback after payment completion.
 * Verifies the payment and activates the subscription if successful.
 *
 * ZainCash can send:
 *   - v1: JWT token in body.token
 *   - v2: JSON body with transactionId, status, orderId
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

function getConfig() {
  return {
    baseUrl:      process.env.ZAINCASH_BASE_URL      ?? 'https://test.zaincash.iq',
    clientId:     process.env.ZAINCASH_CLIENT_ID      ?? '',
    clientSecret: process.env.ZAINCASH_CLIENT_SECRET  ?? '',
    apiKey:       process.env.ZAINCASH_API_KEY        ?? '',
    merchantId:   process.env.ZAINCASH_MERCHANT_ID    ?? '',
    secretKey:    process.env.ZAINCASH_SECRET_KEY     ?? '',
    msisdn:       process.env.ZAINCASH_MSISDN         ?? '',
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

async function inquireTransaction(transactionId: string) {
  const config = getConfig();
  const token = await getAccessToken();
  const response = await fetch(
    `${config.baseUrl}/api/v2/payment-gateway/transaction/inquiry/${transactionId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    const text = await response.text();
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

    // Handle v1 JWT callback
    if (body.token && typeof body.token === 'string') {
      console.log('[ZainCash] v1 JWT callback received');
      const payload = decodeJwt(body.token as string, config.secretKey);
      transactionId = (payload.id ?? payload.transactionId ?? '') as string;
      orderId = (payload.orderId ?? '') as string;
    } else {
      // Handle v2 JSON callback
      console.log('[ZainCash] v2 JSON callback received:', JSON.stringify(body));
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
    console.error('[ZainCash] Callback error:', err);
    // Return 200 to prevent ZainCash from retrying
    return res.status(200).json({ received: true, error: 'Processing failed' });
  }
}
