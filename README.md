<p align="center">
  <img src="./apps/demo-web/src/app/icon.svg" alt="Mintra logo" width="96" height="96" />
</p>

# Mintra

**Reusable verification infrastructure for Mina apps.**

Mintra bridges real-world KYC into Mina credentials and reusable proof presentations. It stays infrastructure-first:

- wallet auth
- KYC orchestration
- normalized claims
- Mina credential issuance
- off-chain presentation verification
- holder binding
- relying party integration

It is **not** a zkApp-only product. zkApp support is an optional extension on top of the core infrastructure.

## What Is Implemented

- Next.js demo frontend
- Fastify API for wallet auth, KYC start, webhook ingestion, normalized claim storage, and Mina credential issuance
- separate verifier service for off-chain Mina presentation verification
- reusable `@mintra/verifier-core` package
- stable `mintra.presentation/v1` envelope format
- verifier-owned single-use presentation challenges
- holder-binding via wallet `signMessage`
- passkey / WebAuthn holder binding on top of wallet binding
- replay protection and audience binding
- proof products:
  - `proof_of_age_18`
  - `proof_of_kyc_passed`
  - `proof_of_country_code`
- verifier playground in the demo app
- relying party demo flow in the demo app
- optional zkApp scaffold under [`examples/zkapp-age-gate`](./examples/zkapp-age-gate/README.md)

## What Is Placeholder / Future Work

- multi-device passkey management and recovery UX
- in-circuit verification of Mintra presentations
- on-chain revocation roots
- productionized verifier state anchoring for zkApps
- published npm packages for the SDK packages in this monorepo

## Proposed Architecture

```text
apps/demo-web
  wallet onboarding
  KYC callback
  protected route
  verifier playground
  relying party demo

services/api
  wallet auth
  Didit session creation
  Didit webhooks
  normalized claims
  Mina credential issuance

services/verifier
  proof product catalog
  presentation request issuance
  Redis-backed challenge storage
  replay protection
  passkey registration / assertion options
  audience verification
  holder-binding verification
  proof verification result

packages/verifier-core
  proof product definitions
  presentation request builder
  presentation envelope helpers
  holder-binding message builder
  verification helpers

packages/provider-didit
  Didit integration

packages/mina-bridge
  normalized claims -> Mina credential mapping

examples/zkapp-age-gate
  optional on-chain integration scaffold
```

More detail:

- [docs/architecture.md](./docs/architecture.md)
- [docs/what-is-mintra.md](./docs/what-is-mintra.md)

## Monorepo Tree

```text
apps/
  demo-web/
docs/
  architecture.md
  consume-proofs.md
  how-credentials-work.md
  how-presentations-work.md
  off-chain-verification.md
  preventing-proof-sharing.md
  replay-protection-and-audience-binding.md
  security-considerations.md
  verifier-integration.md
  what-is-mintra.md
  zkapp-integration.md
  examples/
    fastify-presentation-route.ts
    next-presentation-route.ts
examples/
  zkapp-age-gate/
packages/
  mina-bridge/
  provider-didit/
  sdk-js/
  sdk-types/
  verifier-core/
services/
  api/
  verifier/
```

## Quick Start

Supported wallet status in the current demo:

- Auro: supported for connection, credential storage, and proof presentation
- Pallad: wallet connection works, but credential storage and proof presentation are not supported in the current demo flow

Clorio is not supported in the current Mintra demo flow.

### Prerequisites

- Node.js `>=20`
- pnpm `>=9`
- Auro wallet for the full demo flow
- Pallad wallet only if you want to test wallet connection
- Didit account

### Install

```bash
pnpm install
```

### API config

```bash
cp services/api/.env.example services/api/.env
```

Set:

```env
DIDIT_API_KEY=your_didit_api_key
DIDIT_WEBHOOK_SECRET=your_didit_webhook_secret
DIDIT_WORKFLOW_ID=your_didit_workflow_id
PORT=3001
CORS_ORIGIN=http://localhost:3000
MINA_ISSUER_PRIVATE_KEY=your_mina_private_key
```

### Verifier config

```bash
cp services/verifier/.env.example services/verifier/.env
```

Set:

```env
CORS_ORIGIN=http://localhost:3000
VERIFIER_PUBLIC_URL=http://localhost:3002
PORT=3002
REDIS_URL=
```

If `REDIS_URL` is unset, the verifier falls back to the in-memory challenge store for local development. For production and multi-instance deploys, set `REDIS_URL` so single-use challenge consumption is replay-safe across replicas.

### Frontend config

Create `apps/demo-web/.env.local`:

```env
NEXT_PUBLIC_MINTRA_API_URL=http://localhost:3001
NEXT_PUBLIC_MINTRA_VERIFIER_URL=http://localhost:3002
```

### Run

```bash
pnpm --filter @mintra/api dev
pnpm --filter @mintra/verifier dev
pnpm --filter @mintra/demo-web dev
```

## How Holder Binding Works

The verifier now issues a single-use challenge together with the presentation request.

The holder now performs up to three actions:

1. create the Mina presentation
2. sign a wallet holder-binding message for that exact proof
3. if the verifier requires it, complete a passkey assertion over the same challenge and proof hash

The holder-binding message includes:

- challenge ID
- nonce
- verifier
- audience
- action
- owner public key
- `proof_sha256`
- issue time
- expiry time

The verifier accepts the presentation only if:

- the proof is valid
- the challenge was issued by this verifier
- the challenge is not expired
- the challenge has not already been used
- the challenge survives multi-instance verification through Redis-backed atomic consume semantics in production
- the audience matches
- the credential freshness policy passes
- the wallet holder-binding signature verifies for the proof owner
- the passkey assertion verifies for the wallet-bound passkey binding when the challenge requires passkeys

More detail:

- [docs/how-presentations-work.md](./docs/how-presentations-work.md)
- [docs/preventing-proof-sharing.md](./docs/preventing-proof-sharing.md)
- [docs/replay-protection-and-audience-binding.md](./docs/replay-protection-and-audience-binding.md)

## Proof Products

Mintra now exposes productized proof types.

### `proof_of_age_18`

- display name: `Proof of Age 18+`
- default policy:
  - `minAge: 18`
  - `requireKycPassed: true`
  - `maxCredentialAgeDays: 30`

### `proof_of_kyc_passed`

- display name: `Proof of KYC Passed`
- default policy:
  - `minAge: null`
  - `requireKycPassed: true`
  - `maxCredentialAgeDays: 30`

### `proof_of_country_code`

- display name: `Proof of Country Code`
- default policy:
  - `minAge: null`
  - `requireKycPassed: true`
  - `maxCredentialAgeDays: 30`
- supports country allow / block lists

## Relying Party Integration

The recommended integration is:

1. Mintra issues the credential once.
2. The relying party backend creates a presentation request.
3. The frontend asks the wallet to produce a presentation and wallet holder-binding signature.
4. If passkey binding is required, the frontend requests passkey assertion options from the verifier and signs the same challenge payload with WebAuthn.
5. The relying party backend verifies the presentation envelope.
6. The relying party backend grants or denies access.

Mintra is designed so other services can verify on **their own backend** instead of calling Mintra’s claims API at proof time.

Docs:

- [docs/consume-proofs.md](./docs/consume-proofs.md)
- [docs/off-chain-verification.md](./docs/off-chain-verification.md)
- [docs/verifier-integration.md](./docs/verifier-integration.md)

Backend examples:

- [docs/examples/fastify-presentation-route.ts](./docs/examples/fastify-presentation-route.ts)
- [docs/examples/next-presentation-route.ts](./docs/examples/next-presentation-route.ts)

## SDK Upgrade

`@mintra/verifier-core` now exposes the main verifier-facing primitives:

- `createPresentationRequest(...)`
- `verifyPresentation(...)`
- `verifyHolderBinding(...)`
- `verifyPasskeyBinding(...)`
- `verifyFreshness(...)`
- `verifyAudience(...)`
- `createPresentationEnvelope(...)`
- `buildHolderBindingMessage(...)`
- `buildPasskeySignedPayload(...)`
- `listProofProducts()`

The lower-level compatibility helpers still exist too:

- `buildPresentationRequest(...)`
- `buildAgeOver18PresentationRequest(...)`
- `parsePresentationRequest(...)`
- `serializePresentationRequest(...)`
- `verifyPresentationPolicy(...)`

## Demo App Surfaces

The demo web app now includes:

- `/protected`
  - age-gated route using the verifier service
- `/playground`
  - dynamic proof product and policy builder
- `/relying-party`
  - productized consumer flow for Age 18+ and KYC Passed
  - wallet + passkey protected relying-party verification flow

## Optional zkApp Extension

The zkApp example is intentionally separate from the core product.

See:

- [docs/zkapp-integration.md](./docs/zkapp-integration.md)
- [examples/zkapp-age-gate/README.md](./examples/zkapp-age-gate/README.md)

This is an integration scaffold, not a claim that Mintra’s core architecture has become a full on-chain zkApp protocol.

## Security Notes

- Mintra stores normalized claims, not raw KYC artifacts.
- Mintra claim retention is up to 30 days.
- Freshness can be enforced sooner by verifier policy.
- Didit provider retention still applies independently.
- `MINA_ISSUER_PRIVATE_KEY` should be treated as a high-value issuer secret.
- `services/verifier` should be deployed separately from `services/api`.
- production verifier deployments should use `REDIS_URL` so challenge replay protection works across multiple instances.

More:

- [docs/security.md](./docs/security.md)
- [docs/security-considerations.md](./docs/security-considerations.md)

## Publishing Status

`@mintra/sdk-js`, `@mintra/sdk-types`, and `@mintra/verifier-core` exist in this monorepo today, but they are **not published to npm yet**.

## Next Production Steps

1. publish the verifier-facing packages with stable semver
2. add stronger device-bound holder binding where wallet APIs allow it
3. add revocation / invalidation flows
4. productize the proof presentation standard for third-party integrators
5. expand the zkApp integration layer once on-chain enforcement becomes a real adoption need

## Migration Note

Existing verifier setups keep working without API changes.

- local dev: no action required, memory-backed challenge storage remains the default
- production: set `REDIS_URL` on `services/verifier` and redeploy
- if you want device-bound holder binding: deploy the updated verifier and use the new `/api/passkeys/*` endpoints from your frontend flow

Wallet-only verification still works for wallet-only challenges. Passkey-required challenges add a `passkeyBinding` object to the submitted `mintra.presentation/v1` envelope.

## License

MIT
