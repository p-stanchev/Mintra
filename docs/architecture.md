# Mintra Architecture

## System Overview

Mintra sits between a real-world KYC provider and the Mina credential layer. It handles:
- provider session creation
- webhook verification
- normalized claim extraction
- wallet-bound API auth
- Mina credential issuance into Auro

```text
┌──────────────────────────────────────────────────────────────┐
│  User / Browser                                              │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│  @mintra/demo-web  (Next.js 14)                              │
│                                                              │
│  /                  Wallet-first landing page                │
│  /verify            Starts Didit session                     │
│  /verify/callback   Polls verification status                │
│  /claims/[userId]   Shows normalized claims                  │
│  /protected         Checks age_over_18                       │
│                                                              │
│  Browser auth flow:                                          │
│    POST /api/auth/challenge                                  │
│    window.mina.signMessage(...)                              │
│    POST /api/auth/verify                                     │
│    Bearer token kept in sessionStorage                       │
└──────────────────────────────┬───────────────────────────────┘
                               │ @mintra/sdk-js
┌──────────────────────────────▼───────────────────────────────┐
│  @mintra/api  (Fastify 4)                                    │
│                                                              │
│  Routes:                                                     │
│    POST /api/auth/challenge                                  │
│    POST /api/auth/verify                                     │
│    POST /api/auth/logout                                     │
│    POST /api/verifications/start                             │
│    GET  /api/verifications/:id/status                        │
│    POST /api/providers/didit/webhook                         │
│    GET  /api/claims/:userId                                  │
│    POST /api/mina/issue-credential                           │
│    GET  /health                                              │
│                                                              │
│  Minimal persisted state:                                    │
│    .mintra/state.json                                        │
│    - verifications                                           │
│    - normalized claims                                       │
│    - processed webhook dedupe keys                           │
│                                                              │
│  Ephemeral auth state:                                       │
│    - wallet challenges                                       │
│    - short-lived bearer sessios                              │
└────────────┬──────────────────────────────┬──────────────────┘
             │                              │
┌────────────▼────────────┐    ┌────────────▼──────────────────┐
│ @mintra/provider-didit  │    │ @mintra/mina-bridge           │
│ • createSession()       │    │ • claimsToCredentialData()    │
│ • parseWebhook()        │    │ • issueCredential()           │
│ • mapClaims()           │    │ • Credential.sign(...)        │
│ • HMAC v2 verification  │    │ • ISO country numeric mapping │
└────────────┬────────────┘    └────────────┬──────────────────┘
             │                              │
┌────────────▼────────────┐    ┌────────────▼──────────────────┐
│ Didit REST + webhooks   │    │ mina-attestations             │
└─────────────────────────┘    └───────────────────────────────┘
```

## Verification Flow

1. User connects Auro on the home page.
   - The frontend requests a Mina public key from `window.mina`.
   - The frontend requests a wallet challenge from `/api/auth/challenge`.
   - The wallet signs the challenge message.
   - The frontend exchanges the signature at `/api/auth/verify`.
   - The API returns a short-lived bearer token tied to that wallet.

2. User starts verification.
   - Frontend calls `POST /api/verifications/start`.
   - The API requires a valid wallet bearer token.
   - `userId` must equal the authenticated wallet address.
   - The API creates a Didit session and stores an internal verification record.

3. User completes the hosted Didit flow.
   - Didit redirects the user to `/verify/callback`.
   - Didit separately POSTs a webhook to `/api/providers/didit/webhook`.

4. API processes the webhook.
   - Verifies `x-signature-v2`
   - Rejects stale timestamps
   - Deduplicates `sessionId:rawStatus`
   - Maps provider status to internal status
   - Derives normalized claims:
     - `age_over_18`
     - `kyc_passed`
     - `country_code`
   - Persists only normalized verification state

5. Frontend polls status.
   - `/verify/callback` polls `GET /api/verifications/:id/status`
   - Only the authenticated wallet that owns the verification can read it

6. User views claims and issues a credential.
   - `GET /api/claims/:userId` requires the authenticated wallet to match `:userId`
   - `POST /api/mina/issue-credential` requires:
     - wallet bearer auth
     - fresh auth session
     - `userId === ownerPublicKey === authenticated wallet`
   - The signed credential is stored in Auro

## Auth Model

### Browser → API

Mintra no longer relies on a browser-shared API key.

The browser authenticates with:
- signed wallet challenge
- short-lived bearer token
- wallet-bound route authorization

Protected API routes require bearer auth:
- `/api/verifications/start`
- `/api/verifications/:id/status`
- `/api/claims/:userId`
- `/api/mina/issue-credential`

### Provider → API

Didit authenticates with:
- `x-signature-v2`
- timestamp freshness check
- constant-time HMAC comparison

## Data Model

### Persisted minimal state

Mintra persists only:
- verification id
- wallet/user id
- provider reference
- status
- normalized claims
- timestamps
- webhook dedupe keys

It does not persist:
- raw documents
- selfies
- full webhook payloads
- names
- dates of birth
- document numbers

## Mina Credential Mapping

Normalized claims:

```ts
type NormalizedClaims = {
  age_over_18?: boolean;
  kyc_passed?: boolean;
  country_code?: string;
};
```

Credential data:

```ts
{
  ageOver18: Field(0 | 1),
  kycPassed: Field(0 | 1),
  countryCode: Field(iso3166NumericOrZero),
  issuedAt: Field(unixSeconds)
}
```

The bridge uses `Credential.sign(...)` from `mina-attestations`.

## Current Constraints

- Didit is the only provider integrated
- selective disclosure / verifier-side proof requests are still future work
- auth sessions are ephemeral and are not restored after API restart
- minimal verification state persists locally unless you replace the state file path with a platform-backed volume
