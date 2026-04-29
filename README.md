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
- derived claim trust metadata
- relying party integration

It is **not** a zkApp-only product. zkApp support is an optional extension on top of the core infrastructure.

Core product message:

**Verify once with Mintra. Reuse the credential everywhere. Generate verifier-bound proofs for each app.**

## What Is Implemented

- Next.js demo frontend
- Fastify API for wallet auth, KYC start, webhook ingestion, normalized claim storage, Mina credential issuance, and authenticated backend zk proof generation
- separate verifier service for off-chain Mina presentation verification
- extracted `@mintra/credential-v2` package for commitment-backed credential schemas and utilities
- extracted `@mintra/zk-claims` package for Mina-compatible off-chain o1js proof programs
- reusable `@mintra/verifier-core` package
- stable `mintra.presentation/v1` envelope format
- typed `mintra.zk-policy/v1` request format for off-chain zk proof flows
- verifier-owned single-use presentation challenges
- holder-binding via wallet `signMessage`
- issuer-signed reusable proof-material bundles for zk proving
- passkey / WebAuthn holder binding on top of wallet binding
- replay protection and audience binding
- proof products:
  - `proof_of_age_18`
  - `proof_of_kyc_passed`
  - `proof_of_country_code`
- verifier playground in the demo app
- relying party demo flow in the demo app
- optional zkApp scaffold under [`packages/zk-age-gate-contract`](./packages/zk-age-gate-contract/README.md)

## What Is Placeholder / Future Work

- multi-device passkey management and recovery UX
- in-circuit verification of Mintra presentations
- on-chain revocation roots
- productionized verifier state anchoring for zkApps
- published npm packages for the SDK packages in this monorepo

## Minimal ZK / Privacy Roadmap Hook

Mintra already aims to minimize what gets stored and exposed. The forward-looking privacy direction is:

- selective disclosure:
  prove `age_over_18` without exposing full date of birth
- claim commitments:
  move toward hash or commitment-based claim representations where useful
- zk-proof compatibility:
  keep credential and presentation formats aligned with future Mina-native zero-knowledge verification paths

This is architectural intent, not a claim that full selective-disclosure zk proofs are already deployed in the current demo.

The current bridge step now implemented is a committed-claims foundation:

- sensitive source fields can be represented as commitments such as `dob_commitment`
- public product-facing outputs are carried as derived claims such as `age_over_18`
- raw source identity fields are not retained by Mintra once commitments and derived claims are produced

The current reusable proving model is:

- wallet-bound Mina credential for presentation reuse
- issuer-signed `SignedZkProofMaterialBundle` for zk proving reuse
- wallet-native proof-material storage when the wallet exposes it
- local signed-bundle fallback when the wallet does not
- API recovery path only when the holder has neither wallet-held nor local proof material

The first credential-to-proof binding step is now also in place:

- issued `credentialMetadata.version === "v2"` can carry a zk-friendly `dob_poseidon_commitment`
- the age proof helper can build its public input directly from that Mintra-issued credential metadata
- the verifier can issue a typed zk policy request and check the returned age proof off-chain

This is still not full wallet-issued selective disclosure end to end, but it is now bound to actual Mintra credential metadata rather than an entirely detached proof witness flow.

Current limitation of this bridge step:

- the zk-friendly DOB commitment is deterministic issuer-side commitment data used to bind age proofs to Mintra-issued credential metadata
- it is not yet the final salted commitment design Mintra would want for a production-grade long-term selective-disclosure system

This is not full zk selective disclosure yet, but it is the data-model upgrade that future zk enforcement can build on.

Mintra now also carries trust metadata alongside derived claims and issued credential metadata:

- `derivationMethod`
- `derivationVersion`
- `assuranceLevel`
- `evidenceClass`
- issuer environment metadata such as whether a credential is a demo credential

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

packages/credential-v2
  commitment-backed credential schema
  source commitment helpers
  derived claim metadata

packages/zk-claims
  off-chain o1js proof programs
  first age-threshold proof path
  Mina-compatible selective-disclosure foundation

packages/zk-age-gate-contract
  shared trust-anchor registry
  optional per-app age/KYC gate
  dedicated tsc-built zk contract package

packages/provider-didit
  Didit integration

packages/mina-bridge
  normalized claims -> Mina credential mapping

examples/zkapp-age-gate
  optional on-chain integration scaffold
```

More detail:

- [docs/index.md](./docs/index.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/what-is-mintra.md](./docs/what-is-mintra.md)

## Monorepo Tree

```text
apps/
  demo-web/
docs/
  index.md
  architecture.md
  consume-proofs.md
  fastify-presentation-route.md
  how-credentials-work.md
  next-presentation-route.md
  how-presentations-work.md
  off-chain-verification.md
  preventing-proof-sharing.md
  replay-protection-and-audience-binding.md
  security-considerations.md
  verifier-integration.md
  verifier-self-hosting.md
  what-is-mintra.md
  zkapp-integration.md
examples/
  zkapp-age-gate/
packages/
  credential-v2/
  mina-bridge/
  provider-didit/
  sdk-js/
  sdk-types/
  verifier-core/
  zk-age-gate-contract/
  zk-claims/
services/
  api/
  verifier/
```

## Quick Start

Supported wallet status in the current demo:

- Auro: supported for connection, credential storage, and proof presentation
- Pallad: wallet connection works, but credential storage and proof presentation are not supported in the current demo flow

Clorio is not supported in the current Mintra demo flow.

Credential trust model in the current demo:

- Didit-based verification is treated as production verification
- `/demo-issuer` creates synthetic demo claims without calling Didit
- demo-issued claims are marked as demo credentials and should be rejected by production verifier policy unless explicitly allowed

Privacy and retention in the current demo:

- users explicitly confirm consent before starting verification
- Mintra stores only minimal normalized verification data needed for credential issuance and proof flows
- normalized claims are retained for up to 30 days in the current setup
- export and delete-account workflows are planned, but not fully productized in the demo yet

Current claim model:

- `date_of_birth` is the backend source of truth for age thresholds
- `age_over_18` and `age_over_21` are recomputed server-side from DOB instead of being treated as permanently frozen provider outputs
- `expiresAt` is capped by the earlier of:
  - the verifier freshness window
  - the document expiration date, when Didit provides one
- Mintra can also retain minimal extra metadata that is useful for policy decisions:
  - `nationality`
  - `documentExpiresAt`
- claim responses now also expose `isDemoCredential` as a simple boolean alias in addition to nested trust metadata
- issued wallet credentials stay policy-oriented and compact:
  - `ageOver18`
  - `ageOver21`
  - `kycPassed`
  - `countryCode`
  - `nationalityCode`
  - `documentExpiresAt`
  - `issuedAt`
  - demo / trust fields such as `isDemoCredential`, `credentialMode`, `assuranceLevel`, and `evidenceClass`
- `documentType` was intentionally left out of the wallet credential to keep the payload tighter and avoid carrying low-value identity detail

What Mintra intentionally does not retain:

- names
- document numbers
- addresses
- raw media or biometric assets

Names are intentionally excluded because they do not improve Mintra's proof products, but they do materially increase privacy, compliance, deletion, and breach-risk scope.

### Prerequisites

- Node.js `>=20`
- pnpm `>=9`
- Auro wallet for the full demo flow
- Pallad wallet only if you want to test wallet connection
- At least one provider account: Didit or IdNorm

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
IDNORM_API_KEY=your_idnorm_api_key
IDNORM_WEBHOOK_SECRET=your_idnorm_webhook_secret
IDNORM_CONFIGURATION_ID=your_idnorm_configuration_id
MINTRA_DEFAULT_PROVIDER=didit
PORT=3001
CORS_ORIGIN=http://localhost:3000
MINA_ISSUER_PRIVATE_KEY=your_mina_private_key
MINTRA_ISSUER_ENVIRONMENT=production
MINTRA_ISSUER_ID=mintra-production-issuer
MINTRA_ISSUER_DISPLAY_NAME=Mintra
```

`MINA_ISSUER_PRIVATE_KEY` signs the reusable proof-material bundle that can travel with the holder across sites.

You can configure either provider independently or both at once. When both are configured, `MINTRA_DEFAULT_PROVIDER`
controls the API default and the demo UI lets the user choose between Didit and IdNorm when starting verification.

Didit-backed credentials should stay production. If you want synthetic test credentials, use the `/demo-issuer` page instead of changing the API issuer environment.

### Verifier config

```bash
cp services/verifier/.env.example services/verifier/.env
```

Set:

```env
CORS_ORIGIN=http://localhost:3000
VERIFIER_PUBLIC_URL=http://localhost:3002
TRUST_SOURCE=auto
TRUSTED_ISSUER_PUBLIC_KEY=
MINTRA_REGISTRY_ADDRESS=
MINA_GRAPHQL_URL=https://api.minascan.io/node/devnet/v1/graphql
PORT=3002
REDIS_URL=
```

If `REDIS_URL` is unset, the verifier falls back to the in-memory challenge store for local development. For production and multi-instance deploys, set `REDIS_URL` so single-use challenge consumption is replay-safe across replicas.

`TRUST_SOURCE=auto` makes the verifier prefer Mina registry trust and fall back to the configured issuer key only if registry resolution is unavailable. Use `TRUST_SOURCE=registry` once you want registry lookup and VK-hash matching to be mandatory at startup.

When registry trust is active, the effective issuer comes from `MintraRegistry`. That means:

- API `MINA_ISSUER_PRIVATE_KEY` should derive to the registry issuer public key
- verifier `TRUSTED_ISSUER_PUBLIC_KEY` should match that same public key
- demo-web `NEXT_PUBLIC_MINTRA_TRUSTED_ISSUER_PUBLIC_KEY` should also match it

### Frontend config

Create `apps/demo-web/.env.local`:

```env
NEXT_PUBLIC_MINTRA_API_URL=http://localhost:3001
NEXT_PUBLIC_MINTRA_VERIFIER_URL=http://localhost:3002
NEXT_PUBLIC_MINTRA_ZKAPP_REGISTRY_ADDRESS=
NEXT_PUBLIC_MINTRA_TRUSTED_ISSUER_PUBLIC_KEY=
NEXT_PUBLIC_MINA_GRAPHQL_URL=https://api.minascan.io/node/devnet/v1/graphql
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
  - `maxCredentialAgeDays: 365`

### `proof_of_kyc_passed`

- display name: `Proof of KYC Passed`
- default policy:
  - `minAge: null`
  - `requireKycPassed: true`
  - `maxCredentialAgeDays: 365`

### `proof_of_country_code`

- display name: `Proof of Country Code`
- default policy:
  - `minAge: null`
  - `requireKycPassed: true`
  - `maxCredentialAgeDays: 365`
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

The important distinction is:

- the Mintra **credential** is reusable across many apps
- each **presentation proof** should be fresh and verifier-bound to the app requesting it

So a user verifies once, keeps the credential in their wallet, and then generates a different proof for each relying party that asks for one.

### Off-Chain First, Contract Optional

Mintra does **not** require a Mina zkApp contract for the current selective-disclosure path.

Today the flow is:

1. KYC with Didit
2. Mintra issues a wallet-bound credential
3. the holder reuses wallet-held or signed-bundle proof material
4. the holder or API generates an o1js proof off-chain
5. the verifier checks that proof off-chain on its own backend

That is enough for real reusable verification infrastructure.

An on-chain contract is only needed later if you want:

- zkApps to enforce age / KYC directly on-chain
- an on-chain issuer registry
- an on-chain revocation root
- accepted verification-key anchoring on Mina

The optional `@mintra/zk-contracts` package now supports the cleaner split:

- shared contract for trust anchors
- site-specific policy off-chain
- optional separate per-app enforcement contract if a zkApp truly needs on-chain gating

That means Mintra does not need one global on-chain policy for every site.

- `MintraRegistry` can hold shared trust anchors such as the trusted issuer key, accepted proof VK hashes, credential root, and revocation root
- each site can still ask for its own Mintra verifier policy off-chain
- if a zkApp needs direct on-chain gating, it can deploy its own `MintraAgeGate` instance with its own `minAge` and `requireKycPassed`

So the current recommended build order is:

- Phase 1: off-chain credential issuance
- Phase 2: off-chain o1js proof generation and verifier checks
- Phase 3: optional Mina registry / zkApp enforcement

### Add KYC To Your App In 10 Lines

This is the real verifier-core shape today:

```ts
import { verifyPresentation } from "@mintra/verifier-core";

const result = await verifyPresentation({
  envelope: presentationEnvelope,
  verifierIdentity: "https://app.example.com",
  expectedAudience: "https://app.example.com",
  expectedOwnerPublicKey: walletAddress,
  holderBindingVerifier,
});

if (result.ok && result.output?.kycPassed) {
  // allow access
}
```

Replace `https://app.example.com` with the real relying-party app or backend origin that is performing verification. Another site should use its own domain and request its own fresh proof from the same wallet credential.

### Gate Age Verification In 5 Minutes

```ts
import { createPresentationRequest, verifyPresentation } from "@mintra/verifier-core";

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

if (result.ok && result.output?.ageOver18) {
  // unlock feature
}
```

### 5-Minute Integration

Use the verifier service if you want an HTTP integration instead of calling the package directly:

```ts
const requestResponse = await fetch("https://verifier.example.com/api/presentation-request", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    proofProductId: "proof_of_age_18",
    expectedOwnerPublicKey: walletAddress,
    policy: {
      minAge: 18,
      requireKycPassed: true,
    },
  }),
});

const { requestEnvelope } = await requestResponse.json();

// frontend: ask wallet to build and return a presentationEnvelope

const verifyResponse = await fetch("https://verifier.example.com/api/verify-presentation", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    presentationEnvelope,
    expectedOwnerPublicKey: walletAddress,
  }),
});

const result = await verifyResponse.json();

if (result.ok && result.output?.ageOver18 && result.output?.kycPassed) {
  // allow access
}
```

Docs:

- [docs/consume-proofs.md](./docs/consume-proofs.md)
- [docs/off-chain-verification.md](./docs/off-chain-verification.md)
- [docs/verifier-integration.md](./docs/verifier-integration.md)
- [docs/verifier-self-hosting.md](./docs/verifier-self-hosting.md)

Backend examples:

- [docs/fastify-presentation-route.md](./docs/fastify-presentation-route.md)
- [docs/next-presentation-route.md](./docs/next-presentation-route.md)

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

The easiest path for developers is:

1. call `createPresentationRequest(...)` on the backend
2. let the frontend collect a `presentationEnvelope`
3. call `verifyPresentation(...)` on the backend
4. trust the normalized `result.ok` and `result.output`

The lower-level compatibility helpers still exist too:

- `buildPresentationRequest(...)`
- `buildAgeOver18PresentationRequest(...)`
- `parsePresentationRequest(...)`
- `serializePresentationRequest(...)`
- `verifyPresentationPolicy(...)`

## Standardized Proof Request Format

Mintra already defines its own verifier request standard:

- `mintra.presentation-request/v1`
- challenge payload: `mintra.challenge/v1`

Conceptually, Mintra proof requests carry:

- the proof product being requested
- the verifier policy
- the audience the proof is meant for
- a single-use challenge with replay protection
- holder-binding requirements

At a high level, the request shape is:

```json
{
  "version": "mintra.presentation-request/v1",
  "proofProduct": {
    "id": "proof_of_age_18"
  },
  "challenge": {
    "version": "mintra.challenge/v1",
    "challengeId": "uuid",
    "nonce": "hex",
    "audience": "https://app.example.com",
    "proofProductId": "proof_of_age_18",
    "policy": {
      "minAge": 18,
      "requireKycPassed": true,
      "countryAllowlist": [],
      "countryBlocklist": [],
      "maxCredentialAgeDays": 365
    }
  }
}
```

This is the standard Mintra is building around:

- reusable wallet credential
- verifier-bound proof request
- verifier-bound proof presentation
- normalized verification result

Mintra now also has an early zk-proof request standard for the first off-chain o1js flow:

- `mintra.zk-policy/v1`
- current proof type: `mintra.zk.age-threshold/v1`

The verifier service can now issue a typed zk policy request at:

- `POST /api/zk/policy-request`

and verify the submitted age proof at:

- `POST /api/zk/verify-proof`

Signed proof-material bundles can also be verified directly at:

- `POST /api/mina/verify-proof-bundle`

Current limitation:

- the current zk proof products are verified off-chain
- the policy request carries audience and challenge metadata for verifier workflow
- those audience / challenge fields are **not yet enforced in-circuit**
- the wallet-bound age path is implemented today, while the other proof products are still being hardened to the same reliability tier

## Demo App Surfaces

The demo web app now includes:

- `/protected`
  - age-gated route using the verifier service
- `/demo-issuer`
  - synthetic demo claim generation without calling Didit
  - editable demo fields for age flags, KYC status, country code, nationality, and document expiry
- `/playground`
  - dynamic proof product and policy builder
- `/zk-age`
  - dynamic zk proof runner
  - currently supports age, KYC, and country proof modes
  - prefers authenticated backend proving for reliability and mobile performance
  - resolves reusable proof material from the wallet first, then local signed-bundle fallback
  - falls back to browser-side proving only when the API prove route is unavailable
  - registry address display
  - on-chain registry state readout when `NEXT_PUBLIC_MINTRA_ZKAPP_REGISTRY_ADDRESS` and `NEXT_PUBLIC_MINA_GRAPHQL_URL` are configured
- `/relying-party`
  - productized consumer flow for Age 18+ and KYC Passed
  - wallet + passkey protected relying-party verification flow

## Optional zkApp Extension

The zkApp example is intentionally separate from the core product.

See:

- [docs/zk-proofs-and-registry.md](./docs/zk-proofs-and-registry.md)
- [docs/registry-attestations.md](./docs/registry-attestations.md)
- [docs/zkapp-integration.md](./docs/zkapp-integration.md)
- [packages/zk-age-gate-contract/README.md](./packages/zk-age-gate-contract/README.md)

This is an integration scaffold, not a claim that Mintra’s core architecture has become a full on-chain zkApp protocol.

### Local zkApp Compile / Deploy

The optional contract now lives in its own package so it can be compiled with plain `tsc` instead of the `tsup` / `tsx` toolchain used by the off-chain proof packages.

Compile it locally first:

```bash
pnpm --filter @mintra/zk-contracts compile:local
```

Generate deploy keys:

```bash
pnpm --filter @mintra/zk-contracts gen-keys > keys.json
```

Deploy the shared registry by setting:

- `DEPLOYER_PRIVATE_KEY`
- `ZKAPP_PRIVATE_KEY`
- `MINA_GRAPHQL_URL`
- `TRUSTED_ISSUER_PUBLIC_KEY`
- optional `MINA_ARCHIVE_URL`
- optional `CREDENTIAL_ROOT`
- optional `REVOCATION_ROOT`

and then running:

```bash
pnpm --filter @mintra/zk-contracts deploy
```

If a zkApp needs its own on-chain app policy, deploy the optional age/KYC gate instead:

```bash
pnpm --filter @mintra/zk-contracts deploy:age-gate
```

Registry-backed attestation updates now also support:

```bash
pnpm --filter @mintra/zk-contracts publish:attestation
pnpm --filter @mintra/zk-contracts revoke:attestation
```

## Security Notes

- Mintra stores normalized claims, not raw KYC artifacts.
- Mintra does not need to retain the holder claim record at proof time when a valid signed proof-material bundle is present.
- Mintra claim retention is up to 30 days.
- Freshness can be enforced sooner by verifier policy.
- age thresholds are recomputed server-side from stored DOB instead of trusting a static provider age snapshot
- claim freshness can be capped by document expiration when that data is available
- `nationality` and `documentExpiresAt` can be used for verifier policy without storing names or document numbers
- derived claims now include structured provenance and assurance metadata
- demo credentials can be labeled distinctly from production credentials
- `isDemoCredential` is exposed as a simple response field for integrators
- Didit provider retention still applies independently.
- `MINA_ISSUER_PRIVATE_KEY` should be treated as a high-value issuer secret.
- `services/verifier` should be deployed separately from `services/api`.
- production verifier deployments should use `REDIS_URL` so challenge replay protection works across multiple instances.

On fake data:

- a correctly verified Mintra credential cannot simply be edited client-side and still pass verification
- the real risk is trusting the wrong issuer, trusting demo credentials in production, or accepting weakly-derived metadata without policy checks
- Mintra now exposes issuer and evidence metadata so verifiers can reject demo credentials or require stronger assurance

More:

- [docs/security.md](./docs/security.md)
- [docs/security-considerations.md](./docs/security-considerations.md)

## Browser Runtime Requirement For ZK Proving

Browser-side `o1js` proving uses workers and `SharedArrayBuffer`.

The current demo prefers backend proving through `POST /api/mina/zk-proof`, so these headers are no longer required for the normal `/zk-age` flow.

They are still required if the frontend needs to fall back to browser-side proving:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`

Without those headers, the `/zk-age` page can still load and backend proving can still work, but browser-side fallback proving will be unavailable and the UI will surface that limitation instead of crashing.

## Can Data Be Faked?

Not easily, if the verifier is performing the full Mintra flow correctly.

What is hard to fake:

- an issuer-signed Mina credential
- a valid presentation proof derived from that credential
- holder binding, if the verifier checks the wallet signature
- replay-protected verifier challenges, if the verifier consumes them correctly

What can still go wrong:

- a verifier accepts demo credentials in production
- a verifier trusts the wrong issuer
- a verifier skips holder-binding, audience, freshness, or replay checks
- a verifier treats `provider-normalized` claims as if they were already `zk-proven`

Important limitation:

- Mintra does not yet cryptographically prove in-circuit that every derived claim was correctly computed from committed source data
- that means issuer trust still matters, even though client-side blob editing should not pass proper verification

## Publishing Status

`@mintra/sdk-js`, `@mintra/sdk-types`, `@mintra/credential-v2`, and `@mintra/verifier-core` exist in this monorepo today, but they are **not published to npm yet**.

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
