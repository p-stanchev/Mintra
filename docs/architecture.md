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
│  /verify       Start session → redirect to Didit               │
│  /verify/callback   Poll status → show result                  │
│  /claims/[id]  Show normalized claims                          │
│  /protected    Gated feature (requires age_over_18 = true)     │
└──────────────────────────────┬─────────────────────────────────┘
                               │ @mintra/sdk-js (fetch-based)
┌──────────────────────────────▼─────────────────────────────────┐
│  @mintra/api  (Fastify 4, Node.js)                             │
│                                                                 │
│  Routes:                                                        │
│    POST /api/verifications/start                                │
│    GET  /api/verifications/:id/status                          │
│    POST /api/providers/didit/webhook   ← Didit pushes here     │
│    GET  /api/claims/:userId                                     │
│    POST /api/mina/issue-credential                              │
│    GET  /health                                                 │
│                                                                 │
│  State store: in-memory Maps                                    │
│  Collections: verifications, claims                             │
└────────────┬──────────────────────────────┬────────────────────┘
             │                              │
┌────────────▼────────────┐    ┌────────────▼────────────────────┐
│  @mintra/provider-didit │    │  @mintra/mina-bridge             │
│                         │    │                                  │
│  • createSession()      │    │  • claimsToCredentialData()      │
│  • parseWebhook()       │    │  • MinaBridge.issueCredential()  │
│  • mapClaims()          │    │  • Mina Field type mapping       │
│  • HMAC-SHA256 verify   │    │  • (v2) PresentationSpec scaffold│
└────────────┬────────────┘    └────────────┬────────────────────┘
             │                              │
┌────────────▼────────────┐    ┌────────────▼────────────────────┐
│  Didit REST API          │    │  mina-attestations               │
│  verification.didit.me  │    │  (zksecurity, npm)               │
│  + HMAC-signed webhooks │    │  Credential.sign / toJSON        │
└─────────────────────────┘    └─────────────────────────────────┘
```

## Verification Flow

```
1. User links an Auro wallet on the home page
   └─ Demo app requests a Mina public key from `window.mina`
   └─ Wallet address is stored locally so verification is wallet-first

2. User clicks "Start verification"
   └─ Demo app → POST /api/verifications/start { userId, claim: "age_over_18" }
      └─ API → POST https://verification.didit.me/v3/session/ { vendor_data: userId }
         └─ Didit responds: { session_id, verification_url }
      └─ API stores verification record (status: "not_started")
      └─ Returns { sessionId, verificationUrl } to demo app

3. User is redirected to Didit's verification_url
   └─ User completes document scan + selfie + liveness on Didit's hosted flow

4. Didit POSTs webhook to /api/providers/didit/webhook
   └─ API receives raw buffer, reads x-signature-v2 header
   └─ Verifies HMAC-SHA256 with timingSafeEqual (constant-time comparison)
   └─ Parses payload: { session_id, status, vendor_data, decision }
   └─ Maps status: "Approved" → "approved", "Declined" → "rejected", etc.
   └─ Maps claims:
        decision.id_verification.status === "APPROVED" → age_over_18: true
        rawStatus === "Approved" → kyc_passed: true
        decision.id_verification.country → country_code: "XX"
   └─ Updates the in-memory verification record: status = "approved"
   └─ Upserts the in-memory claims record: { age_over_18, kyc_passed, country_code }
   └─ Returns 200 immediately (prevents Didit retries)

5. Demo app polls GET /api/verifications/:id/status
   └─ Returns current status (not_started | pending | approved | rejected | ...)

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
JSON string — stored and transmitted to the owner (dApp/wallet)
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

The current implementation uses an in-memory store:

- `verifications`: keyed by internal UUID
- `byProviderRef`: keyed by Didit `session_id`
- `claims`: keyed by `userId`

This keeps the demo simple, but it means state is lost on restart. For deployment, move verification state to a persistent store.

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
            └── @mintra/mina-bridge (optional)

@mintra/demo-web
    └── @mintra/sdk-js
```

`mina-attestations` + `o1js` are only in `@mintra/mina-bridge` — their large dependency tree does not affect the SDK or API unless the Mina bridge is explicitly imported.
