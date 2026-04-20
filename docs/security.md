# Mintra Security

## Threat Model

### What Mintra protects

- **Webhook authenticity**: Only webhook payloads with a valid HMAC-SHA256 `x-signature-v2` signature are processed. The signature is verified using constant-time `timingSafeEqual` against the canonical JSON representation. Weaker signature formats (simple concatenation, raw body) are rejected.
- **Replay prevention**: Webhooks include an `x-timestamp` header. Payloads with a timestamp more than 60 seconds old are rejected. Each `sessionId + status` pair is deduplicated — replayed webhooks for the same event are no-ops.
- **API authentication**: All API endpoints (except `/health` and the Didit webhook receiver) require a shared `x-api-key` header. The key is set via `MINTRA_API_KEY` on the server and `NEXT_PUBLIC_MINTRA_API_KEY` on the frontend.
- **Data minimization**: Raw identity documents, selfie images, and full webhook payloads are never stored. Only minimal verification linkage and normalized claim fields are kept in runtime memory.
- **Secret isolation**: All secrets (`DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `MINA_ISSUER_PRIVATE_KEY`, `MINTRA_API_KEY`) live in environment variables server-side. The SDK only receives the `NEXT_PUBLIC_MINTRA_API_KEY` — never the Didit or Mina keys.
- **No PII in logs**: The webhook handler logs errors at the warning level. It does not log raw payloads, user identity data, or session tokens.
- **Input validation**: `userId` values are validated against a strict regex (`/^[a-zA-Z0-9_\-.@:]{1,128}$/`) at the API boundary. Wallet addresses are validated as Mina public key format on the frontend before being written to `localStorage`.
- **CORS lockdown**: The API only accepts requests from the configured `CORS_ORIGIN`. Wildcard origins are rejected at startup.
- **Security headers**: All API responses include `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` headers.
- **Store size limits**: The in-memory store caps verifications at 10,000 and claims at 10,000. Requests beyond the cap return HTTP 503. Processed webhook deduplication keys are capped at 50,000 with LRU-style eviction.

### What Mintra does NOT protect

- **Provider trust**: Mintra trusts the identity decision made by Didit. If Didit is compromised or produces a fraudulent "Approved" result, Mintra will accept it. This is inherent to any provider-backed verification system.
- **Restart persistence**: The current demo keeps verification state in memory only. If the API restarts, in-flight verification state is lost.
- **Mina private key management**: The `MINA_ISSUER_PRIVATE_KEY` must be treated as a high-value secret. If compromised, an attacker can issue fraudulent Mina credentials in Mintra's name.
- **Frontend key exposure**: `NEXT_PUBLIC_MINTRA_API_KEY` is visible in the browser. It prevents anonymous internet abuse but does not protect against a determined attacker who reads it from the page source. For production, move API calls to Next.js server actions so the key stays server-side.

## Webhook Verification

Didit sends webhooks with an `x-signature-v2` header containing an HMAC-SHA256 of the canonicalized (sorted-key, truncated-float) JSON body.

Mintra accepts **only** `x-signature-v2`. Weaker formats (`x-signature-simple`, `x-signature`) are not accepted.

```typescript
// Constant-time comparison on raw 32-byte hex buffers
private compareHmac(expected: string, received: string): boolean {
  const normalizedReceived = received.replace(/^sha256=/i, "").toLowerCase();
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(normalizedReceived, "hex");
  if (expectedBuf.length !== 32 || receivedBuf.length !== 32) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}
```

Fastify is configured with a custom content-type parser that captures the raw buffer before JSON parsing, making it available to the webhook handler for HMAC verification.

### Timestamp and replay protection

```typescript
// 60-second window — stale or future timestamps are rejected
if (Math.abs(currentTime - incomingTime) > 60) {
  throw new Error("Webhook timestamp is stale or too far in the future");
}

// Deduplication — same sessionId+status is a no-op
const dedupeKey = `${event.sessionId}:${event.rawStatus}`;
if (app.store.isWebhookProcessed(dedupeKey)) return reply.status(200).send({ received: true });
```

## Data Handling Policy

### What is stored in memory

| Field | Purpose | Lifetime |
|-------|---------|----------|
| `userId` | Correlate a verification to a wallet/app user | Until API restart |
| `providerReference` | Match incoming Didit webhook to an existing verification | Until API restart |
| `status` | Track verification lifecycle | Until API restart |
| `age_over_18`, `kyc_passed` | App eligibility claims | Until API restart |
| `country_code` | Optional geographic claim (ISO 3166-1 alpha-2) | Until API restart |
| `verifiedAt` | Timestamp of claim issuance | Until API restart |

### What is NOT stored

- Document images (passport, ID card photos)
- Selfie images
- Full webhook JSON bodies
- User name, date of birth, document number
- Provider-internal session tokens
- Raw Didit API responses

### Data minimization rationale

The minimum data required to serve the Mintra use case is: can this `userId` be granted access to a feature requiring `age_over_18`? That requires only a boolean claim and a timestamp. Everything else is derivable from provider support channels using the `providerReference` (Didit session ID) if needed.

## Provider Trust Assumptions

**Didit** is trusted to:
1. Perform a legitimate document + liveness check
2. Return accurate `decision.id_verification.status` values
3. Accurately reflect the document's country field
4. Not forge approval results

Mintra does **not** independently verify the underlying biometric or document checks — it relies on Didit's certification and SLA. Mintra is a bridge, not an identity issuer.

## Mina Issuer Key Management

The `MINA_ISSUER_PRIVATE_KEY` is used to sign `mina-attestations` native credentials. Signing authority means:

- Anyone who obtains this key can issue credentials claiming `kyc_passed: true` for any user
- The key should be treated like a CA private key: stored in a secrets manager (AWS Secrets Manager, HashiCorp Vault, Railway secrets, etc.), never committed to version control, rotated periodically

For v1 development:
- Generate a fresh keypair using `o1js`: `PrivateKey.random().toBase58()`
- Store it only in `services/api/.env` (gitignored) or in your hosting platform's secret store
- Do not reuse across environments

For production:
- Use a dedicated key per environment (dev / staging / prod)
- Rotate on any suspected compromise
- Publish the issuer public key so verifiers can check credential authenticity

## Audit Logging

All sensitive operations emit structured log entries via Fastify's built-in logger:

| Event | Log key |
|---|---|
| Verification created | `verification.created` |
| Verification status read | `verification.status_read` |
| Webhook processed | `webhook.processed` |
| Webhook duplicate ignored | `webhook.duplicate_ignored` |
| Webhook rejected (bad sig) | `webhook.rejected` |
| Claims stored after approval | `webhook.claims_stored` |
| Claims read | `claims.read` |
| Mina credential issued | `mina.credential_issued` |
| Mina credential denied | `mina.issue_denied` |

## What Mintra Does and Does Not Claim

| Claim | Status |
|---|---|
| Provider verification results are authentic | Depends on provider — Mintra verifies webhook signatures only |
| Claims are stored securely | Minimized in memory, not encrypted at rest |
| API endpoints are authenticated | Yes — `x-api-key` required on all non-webhook routes |
| Webhook endpoint is authenticated | Yes — HMAC-SHA256 `x-signature-v2` only |
| Mina credentials are ZK-private | v1: credentials are API-issued JSON; v2 adds ZK proof generation |
| Selective disclosure is supported | v2 scaffold only — not implemented in v1 runtime |
| Mintra is an identity issuer | No — Mintra is a bridge. Didit is the identity issuer. |
| Mintra is fully anonymous | No — provider sees user's real documents; Mintra sees normalized claims |
