# Mintra Roadmap

## v1 — Off-Chain Claims (current)

**Status:** Implemented and deployed

- [x] Real Didit provider integration (session creation, webhook, HMAC verification)
- [x] Normalized claim model (`age_over_18`, `kyc_passed`, `country_code`)
- [x] Fastify API with in-memory verification state (capped, DoS-resistant)
- [x] `@mintra/sdk-js` — typed, fetch-based developer SDK with API key auth
- [x] `@mintra/mina-bridge` — claim-to-Field mapping + `createNative` issuance
- [x] Demo app: wallet-first verification flow, claims view, gated feature
- [x] Auro wallet connect + private credential storage
- [x] Security hardening:
  - [x] API key authentication on all endpoints
  - [x] HMAC-SHA256 webhook verification (v2 only, constant-time comparison)
  - [x] 60-second timestamp window + webhook deduplication
  - [x] userId format validation and redirectUrl allowlist
  - [x] CORS lockdown, security headers
  - [x] Store size limits (DoS prevention)
  - [x] Audit logging for all sensitive operations
  - [x] Wallet address format validation (Mina B62 public key)
- [x] sessionStorage-based session correlation (internal UUID, not provider session ID)

**What v1 does NOT include:**
- On-chain proof verification
- Multiple providers
- Persistent verification storage (state is cleared on API restart)

---

## v2 — Mina Attestations Integration

**Target: on-chain proof generation and verification**

- [x] `PresentationSpec` scaffold for `age_over_18` selective disclosure (`presentation-spec.ts`)
- [x] Mina issuer key management guide (`docs/security.md`)
- [ ] `PresentationRequest` flow — verifier sends a request, wallet produces proof
- [ ] Auro `requestPresentation` integration for selective disclosure
- [ ] Additional wallet integrations (e.g. Pallad)
- [ ] HTTPS verifier endpoint — verify proofs without chain access
- [ ] Demo app: "Prove age" button → wallet popup → proof verified server-side
- [ ] Move API calls to Next.js server actions (keep `MINTRA_API_KEY` fully server-side)

---

## v3 — Multi-Provider + zkApp Verifiers

**Target: production-grade multi-provider ecosystem**

- [ ] Sumsub provider (`packages/provider-sumsub`)
- [ ] Persona provider (`packages/provider-persona`)
- [ ] Veriff provider (`packages/provider-veriff`)
- [ ] On-chain zkApp verifier integration example
- [ ] Mintra claim registry (public issuer key directory)
- [ ] Credential revocation support
- [ ] Persistent state backend (replace `InMemoryStore` with encrypted-at-rest DB)
- [ ] Immutable audit log (claim issuance records)
- [ ] Per-userId rate limiting to prevent claim farming

---

## v4 — Grants & Ecosystem

- [ ] Apply to Mina Builders Grants Program (early exploration + builder grants)
- [ ] Publish `@mintra/sdk-js` to npm
- [ ] Developer documentation site
- [ ] Integration guides for common Mina zkApp patterns
- [ ] Cross-app credential portability (verify once, use across any Mina app)
