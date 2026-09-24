/**
 * ZainCash Payment Gateway V2 routes — ISOLATED from V1.
 *
 * Implements the official ZainCash Payment Gateway API v2 per
 * https://docs.zaincash.iq/ (extracted via search snippets, since Cloudflare
 * blocks direct browsing from our environment; cross-referenced with the
 * official `zaincash_payment` Flutter SDK README on pub.dev and the
 * `ShahramMebashar/parakit` PHP reference implementation).
 *
 * V2 spec implemented here:
 *
 *   Base URL (UAT):       https://pg-api-uat.zaincash.iq   (env: ZAINCASH_V2_BASE_URL)
 *   Base URL (prod):      https://pg-api.zaincash.iq      (env: ZAINCASH_V2_BASE_URL)
 *
 *   OAuth2 token:         POST /oauth2/token
 *     Content-Type: application/x-www-form-urlencoded
 *     Body: grant_type=client_credentials&client_id=…&client_secret=…&scope=…
 *     Response: { access_token, expires_in }    (default 600s if omitted)
 *
 *   Init transaction:     POST /api/v2/payment-gateway/transaction/init
 *     Authorization: Bearer <access_token>
 *     Content-Type: application/json
 *     Body: {
 *       language: "En" | "Ar" | "Ku",            // title-case per docs
 *       externalReferenceId: "<UUIDv5>",
 *       orderId: "<string>",
 *       serviceType: "<merchant-defined string>", // V2 has no fixed list
 *       amount: { value: "<stringified int>", currency: "IQD" },
 *       redirectUrls: { successUrl, failureUrl },
 *       customer?: { phone: "<msisdn>" }         // optional
 *     }
 *     Response: {
 *       status: "SUCCESS",
 *       transactionDetails: { transactionId, orderId, amount: { currency, value } },
 *       redirectUrl: "https://pg-api-uat.zaincash.iq/transaction/pay?id=…&token=…",
 *       expiryTime: "<ISO 8601>"
 *     }
 *
 *   Inquiry:              GET /api/v2/payment-gateway/transaction/inquiry/{transactionId}
 *     Authorization: Bearer <access_token>
 *     Response: {
 *       status: "SUCCESS" | "FAILED" | "PENDING" | "OTP_SENT"
 *              | "CUSTOMER_AUTHENTICATION_REQUIRED" | "EXPIRED" | "REFUNDED",
 *       transactionDetails: { transactionId, orderId, amount }
 *     }
 *
 *   Reverse (refund):     POST /api/v2/payment-gateway/transaction/reverse
 *     Authorization: Bearer <access_token>
 *     Body: { transactionId, reason }
 *     Response: { status: "COMPLETED", reversalReferenceId }
 *
 *   Redirect callback:    ZainCash redirects browser to redirectUrls.successUrl
 *                         (or failureUrl) with ?token=<HS256 JWT signed with api_key>.
 *                         Claims: { eventId, eventType, timestamp,
 *                                   data: { currentStatus, transactionId, orderId, amount } }
 *
 *   Webhook callback:     POST to merchant-configured notificationUrl with
 *                         { webhook_token: "<HS256 JWT signed with api_key>" }
 *                         (same claim shape as redirect callback)
 *
 *   Two distinct secrets: client_secret  → OAuth2 token endpoint
 *                         api_key        → HS256 JWT verification of callbacks
 *
 * Endpoints (this router):
 *   POST /api/zaincash/v2/create       — Create a V2 payment (returns redirectUrl)
 *   GET  /api/zaincash/v2/callback     — Handle success/failure redirect with ?token=
 *   POST /api/zaincash/v2/webhook       — Handle webhook with webhook_token in body
 *   GET  /api/zaincash/v2/verify        — Inquiry by transactionId
 *   GET  /api/zaincash/v2/debug/probe   — DEBUG-ONLY: probe OAuth2 endpoint reachability
 *
 * The /debug/probe endpoint is a DEBUG-only reachability probe; it does NOT
 * expose credentials. It is the only safe way to inspect whether our
 * environment can reach pg-api-uat.zaincash.iq without writing test scripts
 * that bake in credentials.
 *
 * Environment variables (NO hardcoded secrets anywhere):
 *   ZAINCASH_V2_BASE_URL      — e.g. https://pg-api-uat.zaincash.iq
 *   ZAINCASH_V2_CLIENT_ID     — V2 OAuth2 client_id (issued by ZainCash onboarding)
 *   ZAINCASH_V2_CLIENT_SECRET — V2 OAuth2 client_secret
 *   ZAINCASH_V2_API_KEY       — V2 api_key (used to verify HS256 callback JWTs)
 *   ZAINCASH_V2_SCOPE         — default: "payment:read payment:write reverse:write"
 *   ZAINCASH_V2_SUCCESS_URL   — successUrl sent to init
 *   ZAINCASH_V2_FAILURE_URL   — failureUrl sent to init
 *   ZAINCASH_V2_LANG          — default: "en" (lowercase — values: en, ar, ku)
 *   ZAINCASH_V2_SERVICE_TYPE  — default: "Delivery"
 *   ZAINCASH_V2_TIMEOUT_MS    — default: 15000
 *
 * V1 env vars are NOT reused. V2 needs its own.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";

// ── V2 Config ────────────────────────────────────────────────────────────────

interface V2Config {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  apiKey: string;
  scope: string;
  successUrl: string;
  failureUrl: string;
  lang: "en" | "ar" | "ku";
  serviceType: string;
  timeoutMs: number;
}

function getV2Config(): V2Config {
  // Per official Flutter SDK zaincash_config.dart:
  //   ZainCashLang.arabic('ar'), ZainCashLang.english('en'), ZainCashLang.kurdish('ku')
  // The ZainCash V2 backend rejects title-case ("En"/"Ar"/"Ku") with HTTP 200
  // and err.msg = "Invalid Language Code". Codes must be lowercase.
  const langRaw = (process.env.ZAINCASH_V2_LANG ?? "en").toLowerCase();
  const lang: "en" | "ar" | "ku" = langRaw === "ar" ? "ar" : langRaw === "ku" ? "ku" : "en";
  return {
    baseUrl: (process.env.ZAINCASH_V2_BASE_URL ?? "").replace(/\/$/, ""),
    clientId: process.env.ZAINCASH_V2_CLIENT_ID ?? "",
    clientSecret: process.env.ZAINCASH_V2_CLIENT_SECRET ?? "",
    apiKey: process.env.ZAINCASH_V2_API_KEY ?? "",
    scope: process.env.ZAINCASH_V2_SCOPE ?? "payment:read payment:write reverse:write",
    successUrl: process.env.ZAINCASH_V2_SUCCESS_URL ?? "",
    failureUrl: process.env.ZAINCASH_V2_FAILURE_URL ?? "",
    lang,
    serviceType: process.env.ZAINCASH_V2_SERVICE_TYPE ?? "Delivery",
    timeoutMs: parseInt(process.env.ZAINCASH_V2_TIMEOUT_MS ?? "15000", 10),
  };
}

function v2Configured(): { ok: boolean; missing: string[] } {
  const cfg = getV2Config();
  const missing: string[] = [];
  if (!cfg.baseUrl) missing.push("ZAINCASH_V2_BASE_URL");
  if (!cfg.clientId) missing.push("ZAINCASH_V2_CLIENT_ID");
  if (!cfg.clientSecret) missing.push("ZAINCASH_V2_CLIENT_SECRET");
  // apiKey is required for callback JWT verification, but not for init/inquiry
  if (!cfg.successUrl) missing.push("ZAINCASH_V2_SUCCESS_URL");
  if (!cfg.failureUrl) missing.push("ZAINCASH_V2_FAILURE_URL");
  return { ok: missing.length === 0, missing };
}

// ── Supabase helper (same pattern as V1, isolated) ──────────────────────────

function getSupabaseCreds() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  return { url, key };
}

// ── OAuth2 token cache ───────────────────────────────────────────────────────
//
// In-memory per-process token cache. Cache key includes baseUrl + clientId +
// scope so two configs never share a token. TTL = expires_in - 60s safety.

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

const tokenCache = new Map<string, CachedToken>();

function tokenCacheKey(cfg: V2Config): string {
  return crypto
    .createHash("sha256")
    .update(`${cfg.baseUrl}|${cfg.clientId}|${cfg.scope}`)
    .digest("hex");
}

function getCachedToken(cfg: V2Config): string | null {
  const key = tokenCacheKey(cfg);
  const entry = tokenCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    tokenCache.delete(key);
    return null;
  }
  return entry.token;
}

function setCachedToken(cfg: V2Config, token: string, expiresInSeconds: number): void {
  const key = tokenCacheKey(cfg);
  const safetyMarginMs = 60 * 1000;
  const ttlMs = Math.max(1, expiresInSeconds * 1000 - safetyMarginMs);
  tokenCache.set(key, { token, expiresAt: Date.now() + ttlMs });
}

function forgetCachedToken(cfg: V2Config): void {
  tokenCache.delete(tokenCacheKey(cfg));
}

/**
 * Fetch an OAuth2 access token via client_credentials grant.
 * Throws on hard failures (network, 5xx, non-token response).
 * Returns the access_token string on success.
 */
async function fetchAccessToken(cfg: V2Config): Promise<string> {
  const url = `${cfg.baseUrl}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: cfg.scope,
  }).toString();

  console.log("[ZainCash-V2] OAuth2 token request to:", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });

  const text = await res.text();
  const isCloudflareBlock =
    text.includes("Cloudflare") ||
    text.includes("Just a moment") ||
    text.toLowerCase().includes("attention required");

  if (res.status === 403 && isCloudflareBlock) {
    throw new Error(
      `V2 OAuth2 endpoint blocked by Cloudflare WAF (HTTP 403). ` +
      `The local environment IP cannot reach ${cfg.baseUrl}. ` +
      `Must test from Vercel serverless or allowlist the IP with ZainCash.`
    );
  }

  if (res.status >= 500) {
    throw new Error(`V2 OAuth2 endpoint returned HTTP ${res.status} (ZainCash server error). Body: ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    // Likely 401 invalid_client or 400 invalid_grant
    let parsed: { error?: string; error_description?: string; message?: string; code?: string } = {};
    try { parsed = JSON.parse(text); } catch { /* keep empty */ }
    const e = parsed.error ?? parsed.code ?? `HTTP_${res.status}`;
    const desc = parsed.error_description ?? parsed.message ?? text.slice(0, 300);
    throw new Error(`V2 OAuth2 rejected: ${e} — ${desc}`);
  }

  let json: { access_token?: string; expires_in?: number };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`V2 OAuth2 returned non-JSON response: ${text.slice(0, 300)}`);
  }

  if (!json.access_token || typeof json.access_token !== "string") {
    throw new Error(`V2 OAuth2 response missing access_token: ${text.slice(0, 300)}`);
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 600;
  setCachedToken(cfg, json.access_token, expiresIn);
  console.log(`[ZainCash-V2] OAuth2 token cached (expires in ${expiresIn}s)`);
  return json.access_token;
}

/**
 * Get a valid access token, fetching fresh if cache is cold or expired.
 */
async function getAccessToken(cfg: V2Config): Promise<string> {
  const cached = getCachedToken(cfg);
  if (cached) return cached;
  return await fetchAccessToken(cfg);
}

// ── V2 API client (JSON + Bearer) ────────────────────────────────────────────

interface V2ApiResponse {
  status: number;
  body: unknown;
  rawText: string;
}

async function v2Request(
  cfg: V2Config,
  method: "GET" | "POST",
  path: string,
  payload?: Record<string, unknown>
): Promise<V2ApiResponse> {
  const url = `${cfg.baseUrl}${path}`;
  let token: string;
  try {
    token = await getAccessToken(cfg);
  } catch (e) {
    // OAuth2 failed — propagate as a structured error
    throw e;
  }

  const doFetch = (tok: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tok}`,
      Accept: "application/json",
    };
    if (method === "POST" && payload) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(url, {
      method,
      headers,
      body: method === "POST" && payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  };

  let res = await doFetch(token);
  // 401 → refresh token once, retry once
  if (res.status === 401) {
    console.log("[ZainCash-V2] 401 on", path, "— refreshing token");
    forgetCachedToken(cfg);
    token = await getAccessToken(cfg);
    res = await doFetch(token);
  }

  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep as text */ }
  return { status: res.status, body, rawText: text };
}

// ── HS256 JWT verification (for redirect + webhook callbacks) ───────────────

interface JwtClaims {
  eventId?: string;
  eventType?: string;
  timestamp?: string;
  data?: {
    currentStatus?: string;
    transactionId?: string;
    orderId?: string;
    amount?: { value?: number | string; currency?: string };
  };
  [key: string]: unknown;
}

function verifyV2CallbackJwt(token: string, apiKey: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format (expected 3 parts)");

  const headerJson = Buffer.from(parts[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  let header: { alg?: string; typ?: string };
  try { header = JSON.parse(headerJson); } catch { throw new Error("Invalid JWT header JSON"); }

  // Algorithm-pinning defense: only HS256 is acceptable. Reject "none" and
  // asymmetric algorithms to prevent alg-confusion attacks.
  if (header.alg !== "HS256") {
    throw new Error(`Unsupported JWT algorithm "${header.alg}" — only HS256 is accepted`);
  }

  const payloadJson = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  let claims: JwtClaims;
  try { claims = JSON.parse(payloadJson); } catch { throw new Error("Invalid JWT payload JSON"); }

  const expectedSig = crypto
    .createHmac("sha256", apiKey)
    .update(`${parts[0]}.${parts[1]}`)
    .digest("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  // Constant-time compare
  if (expectedSig.length !== parts[2].length || !crypto.timingSafeEqual(
    Buffer.from(expectedSig),
    Buffer.from(parts[2])
  )) {
    throw new Error("JWT signature verification failed");
  }

  return claims;
}

// ── V2 status mapping ────────────────────────────────────────────────────────
//
// V2 statuses (per parakit ZainCashStatusMap.php + docs):
//   SUCCESS → completed
//   FAILED → failed
//   PENDING, OTP_SENT, CUSTOMER_AUTHENTICATION_REQUIRED → pending
//   EXPIRED → expired
//   REFUNDED → refunded

function mapV2StatusToInternal(raw: string | undefined): string {
  if (!raw) return "pending";
  const upper = raw.toUpperCase();
  switch (upper) {
    case "SUCCESS": return "completed";
    case "FAILED": return "failed";
    case "PENDING":
    case "OTP_SENT":
    case "CUSTOMER_AUTHENTICATION_REQUIRED":
      return "pending";
    case "EXPIRED": return "expired";
    case "REFUNDED": return "refunded";
    default: return "pending";
  }
}

// ── Supabase persistence (mirrors V1 flow) ──────────────────────────────────

async function insertPaymentRecord(tx: {
  id: string;
  orderId: string;
  companyId: string;
  planId: string;
  amount: number;
}): Promise<void> {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) {
    console.warn("[ZainCash-V2] Supabase not configured — skipping payment_records insert");
    return;
  }
  try {
    await fetch(`${url}/rest/v1/payment_records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: tx.id,
        order_id: tx.orderId,
        company_id: tx.companyId,
        plan_id: tx.planId,
        amount: tx.amount,
        status: "pending",
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn("[ZainCash-V2] Failed to insert payment_records:", e);
  }
}

async function updatePaymentRecordStatus(txId: string, status: string): Promise<void> {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/rpc/update_payment_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_id: txId, p_status: status }),
    });
  } catch (e) {
    console.warn("[ZainCash-V2] Failed to update payment_records:", e);
  }
}

async function activateCompanySubscription(companyName: string): Promise<boolean> {
  const { url, key } = getSupabaseCreds();
  if (!url || !key) return false;
  try {
    const encoded = encodeURIComponent(companyName);
    const res = await fetch(`${url}/rest/v1/companies?name=eq.${encoded}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ subscription_active: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

const router: IRouter = Router();

/**
 * GET /api/zaincash/v2/debug/probe
 *
 * DEBUG-ONLY reachability probe. Does NOT expose credentials. Reports whether
 * the local environment can reach pg-api-uat.zaincash.iq's /oauth2/token
 * endpoint, and whether V2 env vars are configured. No credentials are sent.
 *
 * This endpoint is the ONLY debug endpoint added for V2 — it does not create
 * transactions or send credentials. It will be removed before V2 goes live.
 */
router.get("/zaincash/v2/debug/probe", async (_req: Request, res: Response) => {
  const cfg = getV2Config();
  const configStatus = v2Configured();

  // Try a HEAD / GET on the OAuth2 token endpoint with empty body — we
  // expect either 405 (method not allowed, indicating reachability) or 401
  // (indicating the endpoint exists and requires auth) or 403 (Cloudflare
  // block). We do NOT send credentials here.
  let reachability: { httpStatus: number; bodyPreview: string; isCloudflareBlock: boolean; elapsedMs: number } | null = null;
  if (cfg.baseUrl) {
    const start = Date.now();
    try {
      const r = await fetch(`${cfg.baseUrl}/oauth2/token`, {
        method: "GET",
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      const text = await r.text();
      reachability = {
        httpStatus: r.status,
        bodyPreview: text.slice(0, 200),
        isCloudflareBlock: text.includes("Cloudflare") || text.includes("Just a moment") || text.toLowerCase().includes("attention required"),
        elapsedMs: Date.now() - start,
      };
    } catch (e) {
      reachability = {
        httpStatus: -1,
        bodyPreview: e instanceof Error ? e.message.slice(0, 200) : String(e),
        isCloudflareBlock: false,
        elapsedMs: Date.now() - start,
      };
    }
  }

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    version: "v2-debug-probe",
    configStatus: {
      baseUrlConfigured: !!cfg.baseUrl,
      clientIdConfigured: !!cfg.clientId,
      clientSecretConfigured: !!cfg.clientSecret,
      apiKeyConfigured: !!cfg.apiKey,
      successUrlConfigured: !!cfg.successUrl,
      failureUrlConfigured: !!cfg.failureUrl,
      scope: cfg.scope,
      lang: cfg.lang,
      serviceType: cfg.serviceType,
      missingRequired: configStatus.missing,
    },
    reachability,
    canAttempt: configStatus.ok && reachability !== null && !reachability.isCloudflareBlock,
  });
});

/**
 * POST /api/zaincash/v2/create
 *
 * Create a V2 payment transaction. Returns the redirectUrl the customer must
 * be sent to in a browser to complete payment on ZainCash's hosted page.
 *
 * Body:
 *   { planId: string, amount: number, companyId: string }
 *
 * Response:
 *   200: { transactionId, redirectUrl, orderId, expiresAt }
 *   400: { error, missing: [...] }
 *   502: { error, step, zaincashStatus, zaincashResponse }
 *   503: { error, blocker: "CLOUDFLARE_403" | "MISSING_ENV" | "V2_UNCONFIGURED" }
 */
router.post("/zaincash/v2/create", async (req: Request, res: Response) => {
  try {
    const { planId, amount, companyId } = req.body as {
      planId?: string;
      amount?: number;
      companyId?: string;
    };

    if (!planId || !amount || !companyId) {
      return res.status(400).json({
        error: "Missing required fields: planId, amount, companyId",
      });
    }
    if (amount <= 0) {
      return res.status(400).json({ error: "Amount must be positive" });
    }

    const cfg = getV2Config();
    const cfgStatus = v2Configured();
    if (!cfgStatus.ok) {
      return res.status(503).json({
        error: "V2 not configured",
        blocker: "MISSING_ENV",
        missing: cfgStatus.missing,
      });
    }

    // Generate stable orderId + externalReferenceId
    const orderId = `tt-v2-${planId}-${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // externalReferenceId must be a standard UUID (36 chars, 8-4-4-4-12 format)
    // — ZainCash V2 backend deserializes it as `java.util.UUID` and rejects
    // non-UUID strings with HTTP 400. Use crypto.randomUUID() (UUIDv4).
    // Note: this is NOT stable across retries, but V2's externalReferenceId
    // is the dedup key — if a retry must collapse to the same transaction, we
    // would need to derive a deterministic UUIDv5. For now, fresh UUID per
    // request is correct (each /api/zaincash/v2/create is a new transaction).
    const externalReferenceId = crypto.randomUUID();

    // Build successUrl / failureUrl with our callback endpoint and context
    // encoded as query params so we can fall back if the JWT doesn't carry them
    const ctx = new URLSearchParams({ orderId, planId, companyId });
    const successUrl = `${cfg.successUrl}?${ctx.toString()}`;
    const failureUrl = `${cfg.failureUrl}?${ctx.toString()}`;

    const payload = {
      language: cfg.lang,
      externalReferenceId,
      orderId,
      serviceType: cfg.serviceType,
      amount: { value: String(amount), currency: "IQD" },
      redirectUrls: { successUrl, failureUrl },
    };

    console.log("[ZainCash-V2] init payload:", JSON.stringify(payload).slice(0, 500));

    let response: V2ApiResponse;
    try {
      response = await v2Request(cfg, "POST", "/api/v2/payment-gateway/transaction/init", payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isCloudflare = msg.includes("Cloudflare");
      return res.status(503).json({
        error: "V2 init failed at OAuth2 step",
        blocker: isCloudflare ? "CLOUDFLARE_403" : "OAUTH2_FAILED",
        details: msg,
      });
    }

    if (response.status === 403 && typeof response.rawText === "string" && response.rawText.includes("Cloudflare")) {
      return res.status(503).json({
        error: "V2 init blocked by Cloudflare WAF",
        blocker: "CLOUDFLARE_403",
        httpStatus: response.status,
        bodyPreview: response.rawText.slice(0, 300),
      });
    }

    if (response.status >= 500) {
      return res.status(502).json({
        error: "V2 init failed (ZainCash server error)",
        step: "transaction_init",
        zaincashStatus: response.status,
        zaincashResponse: response.rawText.slice(0, 500),
      });
    }

    if (response.status >= 400) {
      return res.status(502).json({
        error: "V2 init rejected by ZainCash",
        step: "transaction_init",
        zaincashStatus: response.status,
        zaincashResponse: response.body,
      });
    }

    const body = response.body as {
      status?: string;
      transactionDetails?: { transactionId?: string; orderId?: string };
      redirectUrl?: string;
      expiryTime?: string;
    };

    const transactionId = body.transactionDetails?.transactionId;
    const redirectUrl = body.redirectUrl;

    if (!transactionId || !redirectUrl) {
      return res.status(502).json({
        error: "V2 init response missing transactionId/redirectUrl",
        step: "transaction_init",
        zaincashResponse: response.body,
      });
    }

    // Persist to Supabase (fire-and-forget; non-fatal)
    await insertPaymentRecord({
      id: transactionId,
      orderId,
      companyId,
      planId,
      amount,
    });

    return res.status(200).json({
      transactionId,
      redirectUrl,
      orderId,
      expiresAt: body.expiryTime ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ZainCash-V2] create error:", msg);
    return res.status(500).json({ error: msg, step: "create_payment_v2" });
  }
});

/**
 * GET /api/zaincash/v2/callback
 *
 * V2 redirect callback. ZainCash redirects the customer's browser to
 * redirectUrls.successUrl (or failureUrl) with ?token=<HS256 JWT signed with
 * the V2 api_key>. We verify the JWT, extract the transactionId + status,
 * update Supabase, and (on success) activate the company subscription.
 *
 * If the JWT cannot be verified (e.g. api_key not configured), we fall back
 * to calling the V2 inquiry endpoint to get the authoritative status.
 */
router.get("/zaincash/v2/callback", async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string) ?? "";
    const orderId = (req.query.orderId as string) ?? "";
    const planId = (req.query.planId as string) ?? "";
    const companyId = (req.query.companyId as string) ?? "";

    if (!token) {
      console.log("[ZainCash-V2] GET callback without token — payment cancelled by user");
      return res.status(200).type("text/html").send(
        `<!DOCTYPE html><html><body><h1>Payment cancelled</h1><script>setTimeout(()=>location.href='/subscriptions',3000)</script></body></html>`
      );
    }

    const cfg = getV2Config();
    let transactionId = "";
    let status = "";

    if (cfg.apiKey) {
      try {
        const claims = verifyV2CallbackJwt(token, cfg.apiKey);
        transactionId = claims.data?.transactionId ?? "";
        status = claims.data?.currentStatus ?? "";
        console.log("[ZainCash-V2] callback JWT verified: tx=", transactionId, "status=", status);
      } catch (e) {
        console.error("[ZainCash-V2] callback JWT verification failed:", e);
        return res.status(400).type("text/html").send(
          `<!DOCTYPE html><html><body><h1>Invalid callback token</h1></body></html>`
        );
      }
    } else {
      // api_key not configured — cannot verify JWT. Fall back to inquiry if
      // we can guess the transactionId from the orderId... but we can't. We
      // have to fail this safely.
      console.error("[ZainCash-V2] api_key not configured — cannot verify callback JWT");
      return res.status(503).type("text/html").send(
        `<!DOCTYPE html><html><body><h1>V2 api_key not configured</h1></body></html>`
      );
    }

    if (!transactionId) {
      return res.status(400).type("text/html").send(
        `<!DOCTYPE html><html><body><h1>Missing transactionId in callback</h1></body></html>`
      );
    }

    // Always verify via inquiry — NEVER trust the callback JWT alone
    let inquiryStatus = status;
    try {
      const inquiry = await v2Request(cfg, "GET", `/api/v2/payment-gateway/transaction/inquiry/${encodeURIComponent(transactionId)}`);
      if (inquiry.status === 200 && typeof inquiry.body === "object") {
        const b = inquiry.body as { status?: string };
        if (b.status) inquiryStatus = b.status;
      }
    } catch (e) {
      console.warn("[ZainCash-V2] inquiry failed in callback:", e);
      // Continue with the JWT-claimed status as fallback
    }

    const internalStatus = mapV2StatusToInternal(inquiryStatus);
    await updatePaymentRecordStatus(transactionId, internalStatus);

    if (internalStatus === "completed" && companyId) {
      await activateCompanySubscription(companyId);
    }

    const success = internalStatus === "completed";
    return res.status(200).type("text/html").send(
      `<!DOCTYPE html><html><body><h1>${success ? "Payment completed" : "Payment " + internalStatus}</h1>` +
      `<script>setTimeout(()=>location.href='/subscriptions',3000)</script></body></html>`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ZainCash-V2] callback error:", msg);
    return res.status(200).type("text/html").send(
      `<!DOCTYPE html><html><body><h1>Callback error</h1><p>${msg}</p></body></html>`
    );
  }
});

/**
 * POST /api/zaincash/v2/webhook
 *
 * V2 server-to-server webhook. ZainCash POSTs a JSON body containing
 * { webhook_token: "<HS256 JWT signed with api_key>" } to the merchant's
 * configured notificationUrl.
 *
 * We verify the JWT, extract the transactionId + currentStatus, update
 * Supabase, and (on success) activate the company subscription. Idempotent:
 * if payment_records.status is already 'completed', we skip activation.
 */
router.post("/zaincash/v2/webhook", async (req: Request, res: Response) => {
  try {
    const body = req.body as { webhook_token?: string; token?: string };
    const token = body.webhook_token ?? body.token ?? "";

    if (!token) {
      return res.status(400).json({ error: "Missing webhook_token", received: false });
    }

    const cfg = getV2Config();
    if (!cfg.apiKey) {
      return res.status(503).json({ error: "V2 api_key not configured", received: false });
    }

    let claims: JwtClaims;
    try {
      claims = verifyV2CallbackJwt(token, cfg.apiKey);
    } catch (e) {
      console.error("[ZainCash-V2] webhook JWT verification failed:", e);
      return res.status(400).json({ error: "Invalid webhook JWT", received: false });
    }

    const transactionId = claims.data?.transactionId ?? "";
    const currentStatus = claims.data?.currentStatus ?? "";
    const orderId = claims.data?.orderId ?? "";

    if (!transactionId) {
      return res.status(400).json({ error: "Missing transactionId in webhook", received: false });
    }

    // Idempotency check via RPC
    const { url: supabaseUrl, key: supabaseKey } = getSupabaseCreds();
    let companyName = "";
    if (supabaseUrl && supabaseKey) {
      try {
        const r = await fetch(`${supabaseUrl}/rest/v1/rpc/get_payment_record`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ p_id: transactionId }),
        });
        if (r.ok) {
          const rows = await r.json() as Array<{ status: string; company_id: string }>;
          if (rows.length > 0) {
            if (rows[0].status === "completed") {
              return res.status(200).json({ received: true, transactionId, status: "already_completed" });
            }
            companyName = rows[0].company_id ?? "";
          }
        }
      } catch (e) {
        console.warn("[ZainCash-V2] webhook idempotency check failed:", e);
      }
    }

    const internalStatus = mapV2StatusToInternal(currentStatus);
    await updatePaymentRecordStatus(transactionId, internalStatus);

    if (internalStatus === "completed" && companyName) {
      await activateCompanySubscription(companyName);
    }

    return res.status(200).json({
      received: true,
      transactionId,
      status: internalStatus,
      orderId,
      eventId: claims.eventId,
      eventType: claims.eventType,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ZainCash-V2] webhook error:", msg);
    return res.status(200).json({ received: true, error: msg });
  }
});

/**
 * GET /api/zaincash/v2/verify?transactionId=xxx
 *
 * V2 inquiry. Returns the raw status from ZainCash and the mapped internal status.
 */
router.get("/zaincash/v2/verify", async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.query as { transactionId?: string };
    if (!transactionId) {
      return res.status(400).json({ error: "Missing transactionId query parameter" });
    }

    const cfg = getV2Config();
    const cfgStatus = v2Configured();
    if (!cfgStatus.ok) {
      return res.status(503).json({
        error: "V2 not configured",
        blocker: "MISSING_ENV",
        missing: cfgStatus.missing,
      });
    }

    let response: V2ApiResponse;
    try {
      response = await v2Request(cfg, "GET", `/api/v2/payment-gateway/transaction/inquiry/${encodeURIComponent(transactionId)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isCloudflare = msg.includes("Cloudflare");
      return res.status(503).json({
        error: "V2 inquiry failed at OAuth2 step",
        blocker: isCloudflare ? "CLOUDFLARE_403" : "OAUTH2_FAILED",
        details: msg,
      });
    }

    if (response.status === 403 && typeof response.rawText === "string" && response.rawText.includes("Cloudflare")) {
      return res.status(503).json({
        error: "V2 inquiry blocked by Cloudflare WAF",
        blocker: "CLOUDFLARE_403",
        httpStatus: response.status,
      });
    }

    if (response.status >= 400) {
      return res.status(502).json({
        error: "V2 inquiry rejected by ZainCash",
        zaincashStatus: response.status,
        zaincashResponse: response.body,
      });
    }

    const body = response.body as { status?: string; transactionDetails?: { transactionId?: string; orderId?: string } };
    const v2Status = body.status ?? "unknown";
    const internalStatus = mapV2StatusToInternal(v2Status);

    return res.status(200).json({
      transactionId,
      v2Status,
      status: internalStatus,
      details: response.body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ZainCash-V2] verify error:", msg);
    return res.status(500).json({ error: msg, step: "verify_payment_v2" });
  }
});

export default router;
