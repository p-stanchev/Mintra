# Verifier Integration

Mintra presentations are meant to be consumed on the relying party's own backend.

That is the product direction:

- Mintra issues credentials
- the holder stores them in a Mina wallet
- the relying party creates its own presentation request
- the relying party verifies the returned presentation itself

## Quickest Integration Path

For most developers, the mental model is:

1. backend calls `createPresentationRequest(...)`
2. frontend gets a wallet-produced `presentationEnvelope`
3. backend calls `verifyPresentation(...)`
4. backend checks `result.ok` and the normalized output fields

Minimal package example:

```ts
import {
  createPresentationRequest,
  verifyPresentation,
} from "@mintra/verifier-core";

const request = await createPresentationRequest({
  proofProductId: "proof_of_age_18",
  audience: "https://app.example.com",
  verifier: "https://verifier.example.com",
  walletAddress,
});

const result = await verifyPresentation({
  envelope: presentationEnvelope,
  verifierIdentity: "https://app.example.com",
  expectedAudience: "https://app.example.com",
  expectedOwnerPublicKey: walletAddress,
  holderBindingVerifier,
});

if (result.ok && result.output?.ageOver18 && result.output?.kycPassed) {
  // allow access
}
```

Minimal verifier-service example:

```ts
const requestResponse = await fetch("https://verifier.example.com/api/presentation-request", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    proofProductId: "proof_of_age_18",
    expectedOwnerPublicKey: walletAddress,
  }),
});

const { requestEnvelope } = await requestResponse.json();

const verifyResponse = await fetch("https://verifier.example.com/api/verify-presentation", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    presentationEnvelope,
    expectedOwnerPublicKey: walletAddress,
  }),
});

const result = await verifyResponse.json();
```

## Verifier Endpoints

`services/verifier` exposes:

- `GET /api/proof-products`
- `GET /api/presentation-request`
- `POST /api/presentation-request`
- `GET /api/passkeys/:walletAddress`
- `POST /api/passkeys/register/options`
- `POST /api/passkeys/register/verify`
- `POST /api/passkeys/assertion/options`
- `POST /api/verify-presentation`
- `GET /health`

## Request Creation

`POST /api/presentation-request`

```json
{
  "proofProductId": "proof_of_age_18",
  "expectedOwnerPublicKey": "B62...",
  "requirePasskeyBinding": true,
  "policy": {
    "minAge": 18,
    "requireKycPassed": true,
    "countryAllowlist": [],
    "countryBlocklist": [],
    "maxCredentialAgeDays": 365
  }
}
```

Response:

```json
{
  "proofProduct": {
    "id": "proof_of_age_18",
    "displayName": "Proof of Age 18+"
  },
  "challenge": {
    "version": "mintra.challenge/v1",
    "challengeId": "uuid",
    "audience": "https://your-app.example",
    "proofProductId": "proof_of_age_18"
  },
  "requestEnvelope": {
    "version": "mintra.presentation-request/v1",
    "...": "..."
  }
}
```

The verifier stores the challenge server-side and expects a single verification attempt against it.

Storage mode:

- local dev: in-memory store
- production: Redis-backed challenge store via `REDIS_URL`

The verifier API shape stays the same. The hardening is internal to challenge persistence and consume semantics.

If `requirePasskeyBinding` is `true`, the challenge is still created first, but the WebAuthn assertion options are issued later from `POST /api/passkeys/assertion/options` after the frontend has the exact `presentationJson`.

## Passkey Registration

`POST /api/passkeys/register/options`

```json
{
  "walletAddress": "B62...",
  "deviceName": "Primary laptop"
}
```

`POST /api/passkeys/register/verify`

```json
{
  "registrationId": "uuid",
  "credential": {
    "id": "...",
    "rawId": "...",
    "type": "public-key",
    "response": {
      "attestationObject": "...",
      "clientDataJSON": "...",
      "transports": ["internal"]
    }
  }
}
```

The verifier stores the resulting passkey binding against the wallet / subject.

## Passkey Assertion Options

`POST /api/passkeys/assertion/options`

```json
{
  "challengeId": "uuid",
  "walletAddress": "B62...",
  "presentationJson": "..."
}
```

The verifier returns a WebAuthn challenge plus a signed payload reference that binds:

- `challengeId`
- `nonce`
- `audience`
- `proofSha256`
- wallet / subject identity

## Verification

`POST /api/verify-presentation`

```json
{
  "presentationEnvelope": {
    "version": "mintra.presentation/v1",
    "challenge": { "...": "..." },
    "proof": {
      "format": "mina-attestations/auro",
      "presentationJson": "...",
      "presentationRequestJson": "...",
      "credentialTrust": {
        "issuerEnvironment": "production",
        "issuerId": "mintra-production-issuer",
        "issuerDisplayName": "Mintra",
        "assuranceLevel": "high",
        "evidenceClass": "provider-normalized",
        "demoCredential": false
      }
    },
    "holderBinding": {
      "method": "mina:signMessage",
      "publicKey": "B62...",
      "message": "Mintra proof presentation\n...",
      "signature": {
        "field": "...",
        "scalar": "..."
      },
      "signedAt": "2026-04-21T10:00:00.000Z"
    },
    "passkeyBinding": {
      "bindingId": "passkey-binding-id",
      "credentialId": "credential-id",
      "challenge": "webauthn-challenge",
      "signedPayload": {
        "challengeId": "uuid",
        "nonce": "hex",
        "audience": "https://your-app.example",
        "proofSha256": "sha256hex",
        "walletAddress": "B62...",
        "subjectId": "B62..."
      },
      "credential": {
        "id": "...",
        "rawId": "...",
        "type": "public-key",
        "response": {
          "authenticatorData": "...",
          "clientDataJSON": "...",
          "signature": "..."
        }
      }
    },
    "metadata": {
      "walletProvider": "Auro",
      "submittedAt": "2026-04-21T10:00:02.000Z"
    }
  },
  "expectedOwnerPublicKey": "B62..."
}
```

Success response:

```json
{
  "ok": true,
  "challenge": {
    "challengeId": "uuid",
    "proofProductId": "proof_of_age_18",
    "audience": "https://your-app.example"
  },
  "ownerPublicKey": "B62...",
  "output": {
    "ageOver18": true,
    "ageOver21": false,
    "kycPassed": true,
    "countryCodeNumeric": 100,
    "issuedAt": 1776717714
  },
  "credentialTrust": {
    "issuerEnvironment": "production",
    "issuerId": "mintra-production-issuer",
    "issuerDisplayName": "Mintra",
    "assuranceLevel": "high",
    "evidenceClass": "provider-normalized",
    "demoCredential": false
  },
  "holderBinding": {
    "verified": true
  },
  "audience": {
    "verified": true,
    "expected": "https://your-app.example",
    "actual": "https://your-app.example"
  },
  "freshness": {
    "verified": true,
    "issuedAt": 1776717714,
    "credentialAgeSeconds": 86400,
    "maxAgeDays": 365
  },
  "verifiedAt": "2026-04-21T10:00:03.000Z"
}
```

Normalized failure codes now include:

- `unknown_challenge`
- `expired_challenge`
- `challenge_replay`
- `challenge_audience_mismatch`
- `challenge_nonce_mismatch`
- `challenge_request_mismatch`
- `passkey_missing`
- `passkey_not_registered`
- `passkey_mismatch`
- `passkey_invalid_signature`
- `demo_credential_not_allowed`
- `credential_assurance_too_low`
- `credential_evidence_class_not_allowed`

That gives relying parties explicit verifier outcomes for replay-safe flows in multi-instance deployments.

## Local Integration Flow

1. The backend requests a Mintra presentation challenge.
2. The frontend sends the request to Auro.

The current demo verifier flow is wired against Auro for credential presentation. Pallad connection may work for wallet auth, but presentation is not supported in the demo yet.
3. The frontend signs the holder-binding message with the same wallet.
4. If required, the frontend asks the verifier for passkey assertion options and signs the same challenge payload with WebAuthn.
5. The backend verifies the presentation envelope.
6. The backend atomically consumes the challenge during verification.
7. The backend grants or denies access.

## Verifier Environment

```env
CORS_ORIGIN=https://your-frontend-domain
VERIFIER_PUBLIC_URL=https://your-verifier-domain
REDIS_URL=redis://user:password@host:6379
PORT=3002
```

See:

- [consume-proofs.md](./consume-proofs.md)
- [off-chain-verification.md](./off-chain-verification.md)
- [replay-protection-and-audience-binding.md](./replay-protection-and-audience-binding.md)
