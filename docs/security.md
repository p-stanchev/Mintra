# Mintra Security

## Threat Model

### What Mintra protects

- **Webhook authenticity**: Didit webhooks are accepted only with a valid `x-signature-v2` HMAC signature.
- **Webhook replay resistance**: stale timestamps are rejected, and repeated `sessionId:status` webhook events are deduplicated.
- **Wallet-bound API authorization**: protected browser routes require a signed wallet challenge and a bearer session bound to the signed Mina public key.
- **Credential issuance ownership**: the API issues a Mina credential only when:
  - the caller is authenticated
  - the bearer session is fresh
  - `userId === ownerPublicKey === authenticated wallet`
- **Verifier isolation**: presentation verification runs on a separate service so proof workloads cannot starve webhook handling or issuance.
- **Origin-bound wallet auth**: wallet auth challenges are issued only for trusted origins and verified against the same origin on completion.
- **Data minimization**: Mintra stores only minimal verification linkage and normalized claims. It does not persist raw KYC evidence.
- **Frontend response hardening**: the Next app serves CSP, frame, referrer, and transport security headers.
- **API response hardening**: the API serves security headers and restricts CORS to the configured origin.

### What Mintra does not protect

- **Provider trust**: Mintra trusts Didit’s identity decision.
- **Bearer token theft after frontend compromise**: bearer tokens are stored in `sessionStorage`, so an XSS on the app origin can still compromise the current browser session.
- **Permanent persistence by default**: auth sessions are still in-memory only, and the default persisted state is a local JSON file rather than a managed encrypted datastore.
- **Verifier memory sizing**: proof verification still needs enough RAM; isolation helps blast radius, not absolute resource usage.
- **Issuer key compromise**: if `MINA_ISSUER_PRIVATE_KEY` leaks, an attacker can issue fraudulent credentials.

## Wallet Auth

Browser auth flow:

1. `POST /api/auth/challenge`
2. Wallet signs the returned message with `window.mina.signMessage(...)`
3. `POST /api/auth/verify`
4. API returns a short-lived bearer token

Security properties:
- challenge contains:
  - wallet address
  - origin
  - nonce
  - issue time
  - expiry time
- challenge TTL: 5 minutes
- bearer session TTL: 30 minutes
- credential issuance requires a fresh auth session within 10 minutes
- `/api/auth/logout` revokes the current bearer token

Current storage:
- wallet address: `sessionStorage`
- bearer token: `sessionStorage`

That is safer than long-lived `localStorage` tokens, but it is still a browser-accessible token model.

## Webhook Verification

Didit webhook verification uses:
- canonicalized JSON
- `x-signature-v2`
- constant-time HMAC comparison
- timestamp freshness

Only the v2 signature path is accepted.

## Data Handling Policy

### Persisted by Mintra

Mintra persists only minimal state:

| Field | Purpose |
|---|---|
| `userId` | correlate a verification to a wallet |
| `providerReference` | match Didit webhook to a verification |
| `status` | verification lifecycle |
| `age_over_18` | access control claim |
| `kyc_passed` | access control / issuance claim |
| `country_code` | optional normalized geography claim |
| `verifiedAt` | claim issuance timestamp |
| webhook dedupe keys | replay protection |

Default persistence location:
- `.mintra/state.json`

Retention:
- normalized claims expire after 30 days
- expired claims are dropped when the API hydrates state and when claims are read

### Not persisted by Mintra

- document images
- selfies
- full webhook payloads
- names
- dates of birth
- document numbers
- provider session tokens

### Provider-side retention

Even if Mintra stores only normalized metadata, Didit still retains the underlying verification artifacts according to its own retention policy. In the current setup, that is configured to 1 month.

## Logging

Mintra avoids logging:
- raw webhook bodies
- bearer tokens
- raw KYC payloads
- document details

Current logs still include operational identifiers such as:
- internal verification ids
- provider session ids

Those are lower-risk than raw KYC data, but they are still linkable metadata and should be treated accordingly.

## Secrets

Server-side secrets:
- `DIDIT_API_KEY`
- `DIDIT_WEBHOOK_SECRET`
- `DIDIT_WORKFLOW_ID`
- `MINA_ISSUER_PRIVATE_KEY`
- `MINA_SIGNER_NETWORK`

No frontend API key is required anymore.

## Production Recommendations

- Move minimal state from `.mintra/state.json` to a persistent encrypted store or mounted volume.
- Add a stricter CSP nonce strategy if you want to eliminate `'unsafe-inline'` / dev-time script allowances.
- Treat `MINA_ISSUER_PRIVATE_KEY` like a CA private key.
- Rotate secrets on any suspected exposure.
- Consider shortening auth session TTL further if UX allows.
- Add server-side analytics / monitoring on repeated auth challenge failures and webhook rejects.

## Verifier Separation

`services/verifier` is intentionally independent from `services/api`.

Why:
- `o1js` and `mina-attestations` verification are memory-heavy
- proof verification is a different scaling problem than webhook handling
- third parties should be able to run verifier logic without gaining claim-read access to the API

The verifier:
- does not issue credentials
- does not read Mintra claims
- does not talk to Didit
- only validates a wallet-generated presentation against a request

## What Mintra Does and Does Not Claim

| Claim | Status |
|---|---|
| Provider webhook authenticity is verified | Yes |
| Browser API routes are wallet-authenticated | Yes |
| Credential issuance is wallet-bound | Yes |
| Raw KYC data is stored by Mintra | No |
| Mintra is fully anonymous | No |
| Mintra is an identity issuer | No |
| Verifier-side proof presentation is supported via dedicated verifier service | Yes |
