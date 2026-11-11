# Security & Credential Management Policy

## 1. Architecture & Trust Boundaries
- This portfolio consists of static frontend pages (`index.html`, `privacy-policy/`, `thank-you/`) and a serverless edge endpoint (`functions/api/contact.js` -> `POST /api/contact`).
- There are currently no user accounts, login sessions, or SQL/NoSQL databases in this application.
- Every request received by `/api/contact` is treated as untrusted: method, `Content-Type`, `Origin`, body size, field allowlist, email format, honeypot, rate limiting, and Cloudflare Turnstile verification are enforced on the server before forwarding email.
- **If Authentication or a Database (e.g., Supabase/PostgreSQL) is added later:**
  - Authenticate and verify session tokens/cookies exclusively on server-side endpoints.
  - Enforce Row Level Security (RLS) and parameterized/prepared queries on all database access.
  - Never expose `service_role` or signing keys to browser code.

## 2. Secrets & Environment Variables
- **Public values only in `assets/main.js`:** `turnstileSiteKey` and `gaMeasurementId` are public identifiers intended for client use.
- **Server-only secrets:** `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`, and `ALLOWED_ORIGIN` must live strictly in `.dev.vars` locally (ignored via `.gitignore`) and in Cloudflare Pages encrypted environment variables in production.
- Use separate Turnstile keys and Resend API keys with least-privilege permissions for preview/development versus production.

## 3. Secret Rotation & Incident Response
- **Scheduled Review:** Review active API keys and environment variables quarterly and remove unused credentials immediately.
- **Rotation Procedure (zero-downtime):**
  1. Generate a new key/secret in the provider dashboard (Cloudflare Turnstile or Resend) with scoped permissions.
  2. Update the production secret in Cloudflare Pages Environment Variables and deploy/test `/api/contact`.
  3. Confirm live form delivery succeeds before revoking the previous key.
- **Compromise Response:** If any credential is ever exposed in logs, screenshots, or Git history, revoke and replace it immediately—removing a secret from a latest Git commit alone does not remediate exposure.

## 4. Logging, Monitoring & Backups
- `/api/contact` emits structured JSON security events (`origin_rejected`, `rate_limit_exceeded`, `honeypot_triggered`, `turnstile_verification_failed`, `email_delivery_failed`, `contact_submitted`) with truncated SHA-256 IP hashes—never raw IP addresses, emails, message contents, or secret keys.
- All static portfolio files and edge function code are designed to be version-controlled in Git (with `.gitignore` blocking `.env` / `.dev.vars`), providing immediate source restoration without separate database backups.
