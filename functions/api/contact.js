/**
 * Cloudflare Pages Function — /api/contact
 *
 * Security controls:
 * - Strict method & Content-Type enforcement (POST + application/json)
 * - Explicit CORS handling when ALLOWED_ORIGIN is configured
 * - Actual body-byte limit (16 KB) resistant to chunked encoding bypass
 * - Server-side input validation, single-line CRLF stripping, and mass-assignment prevention
 * - Memory-bounded per-IP sliding-window rate limiting (429 + Retry-After)
 * - Server-side Cloudflare Turnstile verification with request timeout (secret never exposed)
 * - Privacy-preserving structured security logging (zero PII, zero tokens, zero secrets)
 * - Sanitized error responses (zero secret names, stack traces, or internal paths leaked)
 *
 * Server-only environment variables (configure in Cloudflare Pages Dashboard or .dev.vars):
 *   TURNSTILE_SECRET_KEY
 *   RESEND_API_KEY
 *   CONTACT_TO_EMAIL
 *   CONTACT_FROM_EMAIL
 *   ALLOWED_ORIGIN (optional, e.g. "https://aadvikgemini.dev")
 */

const MAX_BODY_BYTES = 16_384;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 5;
const MAX_RATE_BUCKETS = 2000;
const UPSTREAM_TIMEOUT_MS = 8000;
const rateBuckets = new Map();

function sanitizeSingleLine(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\r\n\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeMultiline(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

async function hashIdentifier(raw) {
  try {
    if (globalThis.crypto?.subtle) {
      const data = new TextEncoder().encode(String(raw || "unknown"));
      const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest))
        .slice(0, 6)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // Fall back to fixed opaque tag
  }
  return "anon";
}

function logSecurityEvent(level, event, meta = {}) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...meta
  });
  if (level === "warn" || level === "error") {
    console.warn(entry);
  } else {
    console.info(entry);
  }
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function pruneRateBuckets(now) {
  if (rateBuckets.size < MAX_RATE_BUCKETS) return;
  for (const [key, timestamps] of rateBuckets.entries()) {
    const active = timestamps.filter((ts) => now - ts < RATE_WINDOW_MS);
    if (active.length === 0) {
      rateBuckets.delete(key);
    } else {
      rateBuckets.set(key, active);
    }
  }
}

export function checkRateLimit(ip, now = Date.now()) {
  pruneRateBuckets(now);
  const entry = rateBuckets.get(ip) || [];
  const recent = entry.filter((ts) => now - ts < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_REQUESTS) {
    rateBuckets.set(ip, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  return true;
}

export function resetRateLimiterForTests() {
  rateBuckets.clear();
}

/**
 * Distributed rate-limiting check:
 * 1. Uses Cloudflare Pages/Workers native Rate Limiting binding (`env.CONTACT_RATE_LIMITER`) if bound.
 * 2. Else uses Cloudflare KV (`env.RATE_LIMIT_KV`) fixed-window counter if bound.
 * 3. Falls back to per-isolate in-memory `rateBuckets` when no distributed binding is present.
 */
async function enforceRateLimit(clientIp, ipHash, env) {
  if (env?.CONTACT_RATE_LIMITER && typeof env.CONTACT_RATE_LIMITER.limit === "function") {
    try {
      const { success } = await env.CONTACT_RATE_LIMITER.limit({ key: `contact:${ipHash}` });
      return { allowed: Boolean(success), mode: "cloudflare_ratelimit_binding" };
    } catch {
      // Fall through to secondary limiter on binding error
    }
  }

  if (env?.RATE_LIMIT_KV && typeof env.RATE_LIMIT_KV.get === "function") {
    try {
      const windowBucket = Math.floor(Date.now() / RATE_WINDOW_MS);
      const kvKey = `rl:contact:${ipHash}:${windowBucket}`;
      const current = Number((await env.RATE_LIMIT_KV.get(kvKey)) || 0);
      if (current >= RATE_MAX_REQUESTS) {
        return { allowed: false, mode: "cloudflare_kv" };
      }
      await env.RATE_LIMIT_KV.put(kvKey, String(current + 1), { expirationTtl: 120 });
      return { allowed: true, mode: "cloudflare_kv" };
    } catch {
      // Fall through to in-memory limiter
    }
  }

  return { allowed: checkRateLimit(clientIp), mode: "in_memory_isolate" };
}

function getCorsHeaders(request, env) {
  const headers = {
    Vary: "Origin"
  };
  const allowedOrigin = typeof env?.ALLOWED_ORIGIN === "string" ? env.ALLOWED_ORIGIN.trim() : "";
  const reqOrigin = request.headers.get("Origin");
  if (allowedOrigin && reqOrigin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}

export function onRequestOptions(context) {
  const { request, env } = context;
  const corsHeaders = getCorsHeaders(request, env);
  if (env?.ALLOWED_ORIGIN && !corsHeaders["Access-Control-Allow-Origin"]) {
    return jsonResponse({ ok: false, error: "Origin not permitted." }, 403, { Vary: "Origin" });
  }
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env = {} } = context;
  const corsHeaders = getCorsHeaders(request, env);

  const clientIp =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";
  const ipHash = await hashIdentifier(clientIp);

  // Enforce explicit origin allowlist when configured
  const allowedOrigin = typeof env.ALLOWED_ORIGIN === "string" ? env.ALLOWED_ORIGIN.trim() : "";
  if (allowedOrigin) {
    const reqOrigin = request.headers.get("Origin");
    if (!reqOrigin || reqOrigin !== allowedOrigin) {
      logSecurityEvent("warn", "origin_rejected", { ipHash, status: 403 });
      return jsonResponse({ ok: false, error: "Request origin is not authorized." }, 403, corsHeaders);
    }
  }

  // Require JSON content type
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return jsonResponse(
      { ok: false, error: "Unsupported content type. Expected application/json." },
      415,
      corsHeaders
    );
  }

  const rateStatus = await enforceRateLimit(clientIp, ipHash, env);
  if (!rateStatus.allowed) {
    logSecurityEvent("warn", "rate_limit_exceeded", {
      ipHash,
      mode: rateStatus.mode,
      status: 429
    });
    return jsonResponse(
      { ok: false, error: "Too many requests. Please wait a minute before trying again." },
      429,
      { ...corsHeaders, "Retry-After": "60" }
    );
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, error: "Submission payload is too large." }, 413, corsHeaders);
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ ok: false, error: "Unable to read request body." }, 400, corsHeaders);
  }

  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return jsonResponse({ ok: false, error: "Submission payload is too large." }, 413, corsHeaders);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON request body." }, 400, corsHeaders);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonResponse({ ok: false, error: "Invalid submission structure." }, 400, corsHeaders);
  }

  // Explicit field allowlist (prevents mass assignment)
  const rawWebsite = parsed.website;
  if (typeof rawWebsite === "string" && rawWebsite.trim().length > 0) {
    logSecurityEvent("warn", "honeypot_triggered", { ipHash, status: 400 });
    return jsonResponse({ ok: false, error: "Submission rejected." }, 400, corsHeaders);
  }

  const name = sanitizeSingleLine(parsed.name, 100);
  const email = sanitizeSingleLine(parsed.email, 254).toLowerCase();
  const subject = sanitizeSingleLine(parsed.subject, 140);
  const message = sanitizeMultiline(parsed.message, 3000);
  const turnstileToken =
    typeof parsed.turnstileToken === "string" ? parsed.turnstileToken.trim().slice(0, 4096) : "";

  if (name.length < 2) {
    return jsonResponse(
      { ok: false, error: "Please enter your name (at least 2 characters)." },
      400,
      corsHeaders
    );
  }
  if (!isValidEmail(email)) {
    return jsonResponse(
      { ok: false, error: "Please enter a valid email address." },
      400,
      corsHeaders
    );
  }
  if (subject.length < 2) {
    return jsonResponse(
      { ok: false, error: "Please enter a short subject." },
      400,
      corsHeaders
    );
  }
  if (message.length < 10) {
    return jsonResponse(
      { ok: false, error: "Please enter a message of at least 10 characters." },
      400,
      corsHeaders
    );
  }

  if (!turnstileToken) {
    return jsonResponse(
      { ok: false, error: "Please complete the spam verification check." },
      400,
      corsHeaders
    );
  }

  // Fail closed without exposing internal environment variable names
  if (
    !env.TURNSTILE_SECRET_KEY ||
    !env.RESEND_API_KEY ||
    !env.CONTACT_TO_EMAIL ||
    !env.CONTACT_FROM_EMAIL
  ) {
    logSecurityEvent("error", "missing_server_config", { status: 503 });
    return jsonResponse(
      { ok: false, error: "Contact service is not configured yet. Please check back later." },
      503,
      corsHeaders
    );
  }

  // Verify Cloudflare Turnstile token server-side
  const verifyForm = new FormData();
  verifyForm.append("secret", env.TURNSTILE_SECRET_KEY);
  verifyForm.append("response", turnstileToken);
  if (clientIp !== "unknown") {
    verifyForm.append("remoteip", clientIp);
  }

  let turnstileResult;
  try {
    const verifyResp = await fetchWithTimeout(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: verifyForm
      }
    );
    turnstileResult = await verifyResp.json();
  } catch {
    logSecurityEvent("error", "turnstile_unreachable", { ipHash, status: 502 });
    return jsonResponse(
      { ok: false, error: "Unable to verify request right now. Please try again." },
      502,
      corsHeaders
    );
  }

  if (!turnstileResult?.success) {
    logSecurityEvent("warn", "turnstile_verification_failed", { ipHash, status: 403 });
    return jsonResponse(
      { ok: false, error: "Spam verification failed. Please retry and submit again." },
      403,
      corsHeaders
    );
  }

  try {
    const emailResp = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL,
        to: [env.CONTACT_TO_EMAIL],
        reply_to: email,
        subject: `[Portfolio Contact] ${subject}`,
        text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`
      })
    });

    if (!emailResp.ok) {
      logSecurityEvent("error", "email_delivery_failed", { ipHash, status: 502 });
      return jsonResponse(
        { ok: false, error: "Unable to deliver your message right now. Please try again later." },
        502,
        corsHeaders
      );
    }

    logSecurityEvent("info", "contact_submitted", { ipHash, status: 200 });
    return jsonResponse({ ok: true, redirect: "/thank-you/" }, 200, corsHeaders);
  } catch {
    logSecurityEvent("error", "email_delivery_exception", { ipHash, status: 502 });
    return jsonResponse(
      { ok: false, error: "Unable to deliver your message right now. Please try again later." },
      502,
      corsHeaders
    );
  }
}

export function onRequest(context) {
  const corsHeaders = getCorsHeaders(context.request, context.env || {});
  return jsonResponse({ ok: false, error: "Method not allowed." }, 405, {
    ...corsHeaders,
    Allow: "POST, OPTIONS"
  });
}

/**
 * Runtime-agnostic Web Fetch dispatcher (used by Vercel /api/contact adapter).
 */
export async function handleContactRequest(request, env = {}) {
  const method = (request.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    return onRequestOptions({ request, env });
  }
  if (method === "POST") {
    return onRequestPost({ request, env });
  }
  return onRequest({ request, env });
}
