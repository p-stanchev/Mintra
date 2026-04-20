# Mintra Architecture

## System Overview

Mintra sits between real-world KYC providers and the Mina blockchain. It handles the messy real-world side (HTTP APIs, webhooks, PII minimization) and presents a clean interface to the Mina side (typed claims → `mina-attestations` credentials).

```
┌────────────────────────────────────────────────────────────────┐
│  User / Browser                                                 │
└──────────────────────────────┬─────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────┐
│  @mintra/demo-web  (Next.js 14, App Router)                    │
│                                                                 │
│  /             Wallet-first onboarding + status dashboard       │
│  /verify       Start session → save sessionId → redirect       │
│  /verify/callback   Read sessionId from sessionStorage → poll  │
│  /claims/[id]  Show normalized claims                          │
│  /protected    Gated feature (requires age_over_18 = true)     │
└──────────────────────────────┬─────────────────────────────────┘
                               │ @mintra/sdk-js (x-api-key header)
┌──────────────────────────────▼─────────────────────────────────┐
│  @mintra/api  (Fastify 4, Node.js)                             │
│                                                                 │
│  Auth: x-api-key on all routes except /health + webhook        │
│                                                                 │
│  Routes:                                                        │
│    POST /api/verifications/start                                │
│    GET  /api/verifications/:id/status   (internal UUID only)   │
│    POST /api/providers/didit/webhook   ← Didit pushes here     │
│    GET  /api/claims/:userId                                     │
│    POST /api/mina/issue-credential                              │
│    GET  /health                                                 │
│                                                                 │
│  State store: in-memory Maps (capped at 10k records each)      │
│  Collections: verifications, claims, processedWebhooks         │
└────────────┬──────────────────────────────┬────────────────────┘
             │                              │
┌────────────▼────────────┐    ┌────────────▼────────────────────┐
│  @mintra/provider-didit │    │  @mintra/mina-bridge             │
│                         │    │                                  │
│  • createSession()      │    │  • claimsToCredentialData()      │
│  • parseWebhook()       │    │  • MinaBridge.issueCredential()  │
│  • mapClaims()          │    │  • Mina Field type mapping       │
│  • HMAC-SHA256 verify   │    │  • (v2) PresentationSpec scaffold│
│    (v2 only, 60s window)│    │                                  │
└────────────┬────────────┘    └────────────┬────────────────────┘
             │                              │
┌────────────▼────────────┐    ┌────────────▼────────────────────┐
│  Didit REST API          │    │  mina-attestations               │
│  verification.didit.me  │    │  (zksecurity, npm)               │
│  + HMAC-signed webhooks │    │  createNative / Credential.toJSON│
└─────────────────────────┘    └─────────────────────────────────┘
```

## Verification Flow

```
1. User links an Auro wallet on the home page
   └─ Demo app requests a Mina public key from `window.mina`
   └─ Wallet address is stored in localStorage (validated as B62... format)

2. User clicks "Start verification"
   └─ Demo app → POST /api/verifications/start { userId }
      └─ API → POST https://verification.didit.me/v3/session/ { vendor_data: userId, workflow_id }
         └─ Didit responds: { session_id, verification_url }
      └─ API stores verification record (status: "not_started") in memory
      └─ Returns { sessionId (internal UUID), verificationUrl } to demo app
   └─ Demo app saves internal sessionId to sessionStorage
   └─ User is redirected to verificationUrl

3. User completes document scan + selfie + liveness on Didit's hosted flow
   └─ Didit redirects user back to /verify/callback

4. Didit POSTs webhook to /api/providers/didit/webhook
   └─ API reads x-timestamp — rejects if >60 seconds old
   └─ API reads x-signature-v2 — HMAC-SHA256 of canonical JSON
   └─ Verifies with timingSafeEqual (constant-time, 32-byte comparison)
   └─ Checks deduplication set — ignores replayed sessionId+status pairs
   └─ Parses payload: { session_id, status, vendor_data, decision }
   └─ Maps status: "Approved" → "approved", "Declined" → "rejected", etc.
   └─ Maps claims:
        decision.id_verification.status === "APPROVED" → age_over_18: true
        rawStatus === "Approved" → kyc_passed: true
        decision.id_verification.country → country_code: "XX" (ISO alpha-2)
   └─ Updates verification record: status = "approved"
   └─ Upserts claims record: { age_over_18, kyc_passed, country_code }
   └─ Returns 200 immediately (prevents Didit retries)

5. Demo app reads internal sessionId from sessionStorage
   └─ Polls GET /api/verifications/:id/status every 3 seconds
   └─ Only internal UUIDs are accepted — Didit session IDs are not a lookup key

6. On approval:
   └─ Demo app fetches GET /api/claims/:userId
   └─ Shows normalized claims
   └─ Allows the user to issue a Mina credential into Auro Wallet
   └─ Unlocks /protected feature
```

## Normalized Claim Model

```typescript
type NormalizedClaims = {
  age_over_18?: boolean;   // derived from id_verification.status === "APPROVED"
  kyc_passed?:  boolean;   // derived from top-level status === "Approved"
  country_code?: string;   // ISO 3166-1 alpha-2, from id_verification.country
};
```

**Design principles:**
- Claims are provider-agnostic — a Sumsub or Veriff result maps to the same shape
- No raw provider data is stored — only the derived boolean/string claims
- Country code is optional — not all workflows extract it
- Country names and alpha-3 codes are normalized to alpha-2 via `i18n-iso-countries`

## Mina Bridge Architecture

```
NormalizedClaims
  { age_over_18: true, kyc_passed: true, country_code: "AT" }
          │
          ▼ claimsToCredentialData()
MinaCredentialData
  { ageOver18: 1, kycPassed: 1, countryCode: 40, issuedAt: 1700000000 }
          │
          ▼ Field() conversions
Mina Fields
  { ageOver18: Field(1), kycPassed: Field(1), countryCode: Field(40), issuedAt: Field(ts) }
          │
          ▼ createNative(issuerPrivateKey, { owner, data })
StoredCredential (mina-attestations native type)
          │
          ▼ Credential.toJSON()
JSON string — returned to caller (dApp/wallet holds it)
```

**Type mapping table:**

| Claim field | Mina Field | Encoding |
|---|---|---|
| `age_over_18: true` | `Field(1)` | 1 = yes, 0 = no |
| `kyc_passed: true` | `Field(1)` | 1 = yes, 0 = no |
| `country_code: "AT"` | `Field(40)` | ISO 3166-1 numeric |
| `country_code: undefined` | `Field(0)` | sentinel for "not provided" |
| `issuedAt` | `Field(unixSeconds)` | Unix timestamp |

## Runtime Store

The current implementation uses an in-memory store (`InMemoryStore`) backed by JavaScript Maps:

| Collection | Key | Cap |
|---|---|---|
| `verifications` | Internal UUID | 10,000 |
| `byProviderRef` | Didit `session_id` | 10,000 (mirrors verifications) |
| `claims` | `userId` | 10,000 |
| `processedWebhooks` | `sessionId:rawStatus` | 50,000 (LRU eviction at cap) |

State is lost on restart. For production, replace `InMemoryStore` with a persistent backend — the `VerificationStore` interface makes this a drop-in swap.

## API Authentication

All routes except `/health` and `/api/providers/didit/webhook` require:

```
x-api-key: <MINTRA_API_KEY>
```

The webhook route uses HMAC-SHA256 (`x-signature-v2`) instead, since it is called by Didit's servers, not by the frontend.

## Provider Abstraction

```typescript
interface VerificationProvider {
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  parseWebhook(request: IncomingWebhook): Promise<NormalizedWebhookEvent>;
  mapClaims(event: NormalizedWebhookEvent): NormalizedClaims;
}
```

Adding a new provider (e.g. Sumsub) means:
1. Create `packages/provider-sumsub/`
2. Implement `VerificationProvider`
3. Register it in the API's `buildApp()`
4. Add a new webhook route `/api/providers/sumsub/webhook`

No changes to `sdk-js`, `mina-bridge`, or the claim model.

## Package Dependency Graph

```
@mintra/sdk-types
    ├── @mintra/sdk-js
    ├── @mintra/provider-didit
    ├── @mintra/mina-bridge
    └── @mintra/api
            ├── @mintra/provider-didit
            └── @mintra/mina-bridge (optional, loaded only if MINA_ISSUER_PRIVATE_KEY is set)

@mintra/demo-web
    └── @mintra/sdk-js
```

`mina-attestations` + `o1js` are only in `@mintra/mina-bridge` — their large dependency tree does not affect the SDK or API unless the Mina bridge is explicitly imported.
