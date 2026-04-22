# Mintra Security

## What Mintra Protects Today

- Didit webhook authenticity with HMAC verification
- wallet-bound API access with signed Mina challenges
- credential issuance bound to the authenticated wallet
- presentation replay protection with single-use verifier challenges
- Redis-backed multi-instance challenge coordination for production verifier deployments
- audience binding for presentation verification
- wallet holder-binding signature verification
- optional passkey / WebAuthn holder-binding verification
- freshness enforcement for verifier policies
- minimal normalized-claim persistence instead of raw KYC storage

## What Mintra Does Not Claim Yet

- seamless multi-device passkey recovery
- total resistance to collusion or live forwarding
- in-circuit proof verification for zkApps
- on-chain revocation enforcement
- zero trust in the underlying KYC provider

## Secrets

Keep these server-side:

- `DIDIT_API_KEY`
- `DIDIT_WEBHOOK_SECRET`
- `DIDIT_WORKFLOW_ID`
- `MINA_ISSUER_PRIVATE_KEY`

The frontend no longer needs a shared API key.

Verifier-side infrastructure secrets / config:

- `REDIS_URL`
- `VERIFIER_PUBLIC_URL`

Passkey-specific note:

- passkey public keys are verifier-side binding material, not frontend secrets

## Storage Model

Mintra stores:

- verification IDs
- wallet/user IDs
- normalized claims
- source commitment metadata
- derived claim metadata
- verification timestamps
- webhook dedupe markers
- verifier challenge records
- passkey public key bindings and counters

Mintra does not store:

- document images
- selfies
- raw identity payloads
- full provider webhook payloads

## Commitments And Derived Claims

Mintra now distinguishes between:

- source data:
  the sensitive provider fields
- source commitments:
  deterministic hashes of selected sensitive fields
- derived claims:
  product-facing values such as `age_over_18`

Security benefit:

- Mintra can keep only commitments plus derived claims without retaining raw source identity fields
- verifier flows can continue to operate on minimal public claims
- future zk selective-disclosure work has a concrete data-model foundation

Current limitation:

- Mintra does not yet cryptographically prove the relationship between a derived claim and its source commitment during verification
- that commitment relation remains a future zk integration step

## Retention

- Mintra normalized claims: up to 30 days
- Didit retention: provider-side and separate from Mintra

## Consent And Data Minimization

- the demo verification flow now requires explicit user acknowledgment before redirecting to the provider
- Mintra keeps only minimal normalized verification data needed for credential issuance and proof verification
- raw KYC payloads, images, and document scans are not retained by Mintra
- export, delete-account, and automated deletion workflows are still productization items rather than complete demo features

## Deployment Guidance

- run `services/verifier` separately from `services/api`
- treat the verifier as memory-heavy infrastructure
- keep `CORS_ORIGIN` strict
- use mounted or managed storage instead of local files in production
- set `REDIS_URL` for multi-instance or autoscaled verifier deployments
- review WebAuthn RP ID / origin expectations when deploying passkey flows behind a new domain

## Replay And Passkeys

Passkeys do not replace replay protection. Mintra still requires:

- single-use verifier challenge IDs
- verifier nonces
- challenge expiry
- audience checks
- atomic challenge consumption

The passkey assertion is bound to the same challenge and `proof_sha256`, so replaying the proof with a different passkey assertion or against a different audience fails verification.

## Device Loss And Recovery

Current implementation supports a single active passkey binding per wallet in the simple store path.

Production rollouts should plan for:

- passkey re-registration flows
- support / recovery policy
- optional multiple-device enrollment
