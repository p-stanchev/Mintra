# Mintra Roadmap

## v1 — Off-Chain Claims (current)

**Status:** Implemented

- [x] Real Didit provider integration (session creation, webhook, HMAC verification)
- [x] Normalized claim model (`age_over_18`, `kyc_passed`, `country_code`)
- [x] Fastify API with in-memory verification state
- [x] `@mintra/sdk-js` — typed, fetch-based developer SDK
- [x] `@mintra/mina-bridge` — claim-to-Field mapping + `createNative` issuance scaffold
- [x] Demo app: wallet-first verification flow, claims view, gated feature
- [x] Auro wallet connect + private credential storage
- [x] Security: HMAC webhook verification, secret isolation, no raw PII storage

**What v1 does NOT include:**
- On-chain proof verification
- Multiple providers
- API authentication layer
- Persistent verification storage

---

## v2 — Mina Attestations Integration

**Target: on-chain proof generation and verification**

- [ ] `PresentationSpec` for `age_over_18` selective disclosure (scaffold already in `presentation-spec.ts`)
- [ ] `PresentationRequest` flow — verifier sends a request, wallet produces proof
- [ ] Auro `requestPresentation` integration for selective disclosure
- [ ] Additional wallet integrations (for example Pallad)
- [ ] HTTPS verifier endpoint — verify proofs without chain access
- [ ] Demo app: "Prove age" button → wallet popup → proof verified server-side
- [ ] Mina issuer key management guide for production deployments
- [ ] API authentication (bearer tokens)

---

## v3 — Multi-Provider + zkApp Verifiers

**Target: production-grade multi-provider ecosystem**

- [ ] Sumsub provider (`packages/provider-sumsub`)
- [ ] Persona provider (`packages/provider-persona`)
- [ ] Veriff provider (`packages/provider-veriff`)
- [ ] On-chain zkApp verifier integration example
- [ ] Mintra claim registry (public issuer key directory)
- [ ] Credential revocation support
- [ ] Rate limiting per userId (prevent claim farming)
- [ ] Persistent state backend with encryption-at-rest strategy
- [ ] Audit log (immutable claim issuance records)

---

## v4 — Grants & Ecosystem

- [ ] Apply to Mina Builders Grants Program (early exploration + builder grants)
- [ ] Publish `@mintra/sdk-js` to npm
- [ ] Developer documentation site
- [ ] Integration guides for common Mina zkApp patterns
- [ ] Cross-app credential portability (verify once, use across any Mina app)
