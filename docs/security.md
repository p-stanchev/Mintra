# Mintra Security

## Threat Model

### What Mintra protects

- **Webhook authenticity**: Only webhook payloads with a valid HMAC-SHA256 signature from the provider's workflow secret are processed. Signature verification uses `timingSafeEqual` to prevent timing attacks.
- **Data minimization**: Raw identity documents, selfie images, and full webhook payloads are never stored. Only normalized claim fields are persisted.
- **Secret isolation**: All secrets (`DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `MINA_ISSUER_PRIVATE_KEY`) live in environment variables server-side. The SDK never receives or exposes these.
- **No PII in logs**: The webhook handler logs errors at the warning level; it does not log raw payloads or user identity data.

### What Mintra does NOT protect

- **Provider trust**: Mintra trusts the identity decision made by Didit. If Didit is compromised or produces a fraudulent "Approved" result, Mintra will accept it. This is inherent to any provider-backed verification system.
- **Database at-rest encryption**: The SQLite database is not encrypted at rest by default. In production, use filesystem-level encryption or switch to an encrypted-at-rest database.
- **API authentication**: The current API has no authentication layer — it relies on network-level access control in production (private VPC, ingress rules). Add bearer token auth before exposing to the public internet.
- **Mina private key management**: The `MINA_ISSUER_PRIVATE_KEY` must be treated as a high-value secret. If compromised, an attacker can issue fraudulent Mina credentials in Mintra's name.

## Webhook Verification

Didit sends webhooks with three signature headers:
- `x-signature-v2`: HMAC-SHA256 of the raw JSON string (handles middleware re-encoding)
- `x-signature`: HMAC-SHA256 of raw bytes
- `x-signature-simple`: HMAC of `{session_id}|{status}|{created_at}`

Mintra reads `x-signature-v2` first, falling back to `x-signature`. The HMAC is computed against the raw `Buffer` received by Fastify before any JSON parsing.

```typescript
// Constant-time comparison — prevents timing attacks
if (!timingSafeEqual(expectedBuf, receivedBuf)) {
  throw new Error("Webhook signature verification failed");
}
```

Fastify is configured with a custom content-type parser that captures the raw buffer before JSON parsing, making it available to the webhook handler via `request.rawBody`.

## Data Handling Policy

### What is stored

| Field | Table | Purpose | Retention |
|-------|-------|---------|-----------|
| `user_id` | verifications, claims | User correlation | Until user deletion request |
| `provider_reference` | verifications | Provider session ID for support | Until user deletion |
| `status` | verifications | Verification lifecycle | Until user deletion |
| `age_over_18`, `kyc_passed` | claims | App eligibility | Until user deletion |
| `country_code` | claims | Optional geographic claim | Until user deletion |
| `verified_at` | claims | Audit timestamp | Until user deletion |

### What is NOT stored

- Document images (passport, ID card photos)
- Selfie images
- Full webhook JSON bodies
- User name, date of birth, document number
- Provider-internal session tokens

### Data minimization rationale

The minimum data required to serve the Mintra use case is: can this `userId` be granted access to a feature requiring `age_over_18`? That requires only a boolean claim and a timestamp. Everything else is derivable from provider support channels using the `provider_reference` (Didit session ID) if needed.

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
- The key should be treated like a CA private key: stored in a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.), never committed to version control, rotated periodically

For v1 development:
- Generate a fresh keypair: `o1js` `PrivateKey.random().toBase58()`
- Store it only in `services/api/.env` (which is gitignored)
- Do not reuse across environments

For production:
- Use a dedicated key per environment (dev / staging / prod)
- Rotate on any suspected compromise
- Publish the issuer public key so verifiers can check credential authenticity

## What Mintra Does and Does Not Claim

| Claim | Status |
|---|---|
| Provider verification results are authentic | Depends on provider — Mintra verifies webhook signatures only |
| Claims are stored securely | Minimized, not encrypted at rest |
| Mina credentials are ZK-private | v1: credentials are API-issued JSON; v2 adds ZK proof generation |
| Selective disclosure is supported | v2 scaffold only — not implemented in v1 runtime |
| Mintra is an identity issuer | No — Mintra is a bridge. Didit is the identity issuer. |
| Mintra is fully anonymous | No — provider sees user's real documents; Mintra sees normalized claims |
