# Verifier Integration

Mintra is designed to be consumed on the relying party's own backend.

The current product shape is:

- Mintra issues credentials
- the holder keeps them in a wallet
- the relying party asks for a fresh proof or presentation
- the relying party verifies the result on its own backend

## Main HTTP Surface

`services/verifier` currently exposes:

- `GET /api/proof-products`
- `GET /api/presentation-request`
- `POST /api/presentation-request`
- `GET /api/passkeys/:walletAddress`
- `POST /api/passkeys/register/options`
- `POST /api/passkeys/register/verify`
- `POST /api/passkeys/assertion/options`
- `POST /api/verify-presentation`
- `POST /api/zk/policy-request`
- `POST /api/zk/verify-proof`
- `GET /health`

## Presentation Flow

### Create a presentation request

`POST /api/presentation-request`

Example:

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

### Verify a presentation

`POST /api/verify-presentation`

The verifier returns a normalized result with fields such as:

- `ok`
- `challenge`
- `ownerPublicKey`
- `output`
- `credentialTrust`
- `holderBinding`
- `audience`
- `freshness`
- `error`
- `verifiedAt`

## ZK Proof Flow

The reusable trust model for zk proofs is:

- the holder wallet identity
- an issuer-signed proof-material bundle
- the verifier's typed zk policy request
- shared on-chain trust anchors through `MintraRegistry`
- env-based trusted issuer fallback only when registry trust is unavailable or intentionally disabled

### Create a zk policy request

`POST /api/zk/policy-request`

Example:

```json
{
  "proofType": "mintra.zk.age-threshold/v1",
  "minAge": 18
}
```

Other supported proof types:

- `mintra.zk.kyc-passed/v1`
- `mintra.zk.country-membership/v1`

Country example:

```json
{
  "proofType": "mintra.zk.country-membership/v1",
  "countryAllowlist": ["BG", "DE"],
  "countryBlocklist": []
}
```

### Verify a zk proof

`POST /api/zk/verify-proof`

Example request:

```json
{
  "request": {
    "version": "mintra.zk-policy/v1",
    "proofType": "mintra.zk.age-threshold/v1",
    "audience": "https://app.example.com",
    "verifier": "https://verifier.example.com",
    "challenge": {
      "challengeId": "uuid",
      "nonce": "hex",
      "issuedAt": "2026-04-25T00:00:00.000Z",
      "expiresAt": "2026-04-25T00:05:00.000Z"
    },
    "requirements": {
      "ageGte": 18
    },
    "publicInputs": {
      "referenceDate": "2026-04-25",
      "commitmentKey": "dob_poseidon_commitment"
    }
  },
  "proofMaterialBundle": {
    "version": "mintra.zk-proof-material/v2",
    "walletAddress": "B62...",
    "issuerPublicKey": "B62...",
    "issuedAt": "2026-04-26T00:00:00.000Z",
    "proofMaterial": {
      "userId": "B62..."
    },
    "issuerSignature": {
      "field": "...",
      "scalar": "..."
    }
  },
  "proof": {
    "publicInput": ["...", "18", "2026", "4", "25"],
    "publicOutput": [],
    "maxProofsVerified": 0,
    "proof": "base64..."
  }
}
```

The verifier currently:

1. validates the typed zk policy request
2. resolves trusted issuer and proof-program trust anchors from the Mina registry by default
3. verifies the signed proof-material bundle against the resolved trusted issuer public key
4. verifies audience and expiry
5. verifies the raw proof JSON against the compiled verification key
6. confirms the raw `publicInput` array matches the requested policy and the signed bundle commitments

If registry trust is active, the verifier also confirms that the on-chain VK hashes match its locally compiled proof programs before it accepts the registry result.

### Registry-first trust resolution

`services/verifier` supports:

- `TRUST_SOURCE=auto`
- `TRUST_SOURCE=registry`
- `TRUST_SOURCE=env`

In `auto` mode, the verifier prefers Mina registry trust and falls back to `TRUSTED_ISSUER_PUBLIC_KEY` only when registry resolution fails and a fallback issuer key is still configured.

When registry trust is active, the effective issuer is the registry's `issuerPublicKey`. The API signing key and the frontend trusted issuer key should be aligned to that same public key.

### Verify a signed proof-material bundle directly

`POST /api/mina/verify-proof-bundle`

This route is useful for import, backup restore, and cross-site portability checks before proving.

## Passkeys

Passkeys are optional and sit on top of wallet holder binding.

Registration endpoints:

- `POST /api/passkeys/register/options`
- `POST /api/passkeys/register/verify`

Assertion endpoint:

- `POST /api/passkeys/assertion/options`

## Verifier Environment

```env
CORS_ORIGIN=https://your-frontend-domain
VERIFIER_PUBLIC_URL=https://your-verifier-domain
TRUST_SOURCE=auto
TRUSTED_ISSUER_PUBLIC_KEY=B62...
MINTRA_REGISTRY_ADDRESS=B62...
MINA_GRAPHQL_URL=https://api.minascan.io/node/devnet/v1/graphql
REDIS_URL=redis://user:password@host:6379
PORT=3002
```

If `REDIS_URL` is unset, the verifier uses an in-memory store. That is fine for local development, but production should use Redis so replay protection survives multiple instances.

Use `TRUST_SOURCE=registry` once your registry deployment is stable and you want startup to fail instead of silently falling back to env trust.

## Related Docs

- [off-chain-verification.md](./off-chain-verification.md)
- [consume-proofs.md](./consume-proofs.md)
- [replay-protection-and-audience-binding.md](./replay-protection-and-audience-binding.md)
- [zk-proofs-and-registry.md](./zk-proofs-and-registry.md)
- [verifier-self-hosting.md](./verifier-self-hosting.md)
