/**
 * Vercel Serverless Function — /api/contact
 * Delegates to the shared hardened handler in /functions/api/contact.js
 * so all validation, sanitization, Turnstile verification, rate limiting,
 * and non-PII logging stay in a single source of truth.
 */

import { handleContactRequest } from "../functions/api/contact.js";

async function readRawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > 20_480) {
      return "__OVERSIZED__";
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  const method = (req.method || "GET").toUpperCase();
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const url = `${proto}://${host}${req.url || "/api/contact"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  // Forward Vercel client IP header into X-Forwarded-For / CF-Connecting-IP consistently
  if (!headers.get("cf-connecting-ip") && typeof req.headers["x-real-ip"] === "string") {
    headers.set("x-forwarded-for", req.headers["x-real-ip"]);
  }

  let body;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const raw = await readRawBody(req);
    if (raw === "__OVERSIZED__") {
      res.status(413).json({ ok: false, error: "Submission payload is too large." });
      return;
    }
    body = raw;
  }

  const webRequest = new Request(url, {
    method,
    headers,
    body
  });

  const webResponse = await handleContactRequest(webRequest, process.env);

  res.status(webResponse.status);
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const text = await webResponse.text();
  res.send(text);
}
