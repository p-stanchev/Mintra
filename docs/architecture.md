# Mintra Architecture

## Product Shape

Mintra stays infrastructure-first.

The current core is:

1. wallet authentication
2. KYC provider orchestration
3. normalized claims and commitment-backed metadata
4. wallet-bound Mina credential issuance
5. verifier-owned presentation requests
6. off-chain proof verification with holder binding
7. off-chain o1js selective-disclosure proof verification

Optional on top of that:

8. shared on-chain trust anchors
9. optional per-app zkApp enforcement

## Current Layering

```text
apps/demo-web
  wallet onboarding
  KYC start and callback
  protected route
  verifier playground
  zk proof runner
  relying-party demo

services/api
  wallet auth challenge and verify
  Didit session creation
  Didit webhook ingestion
  normalized claim storage
  credential metadata generation
  Mina credential issuance into Auro

packages/provider-didit
  provider session creation
  webhook verification
  normalized claim extraction

packages/credential-v2
  commitment-backed credential metadata
  source commitment helpers
  trust metadata

packages/mina-bridge
  normalized claims to Mina credential mapping
  issuer signing
  wallet credential JSON

packages/zk-claims
  o1js proof programs
  age threshold proofs
  KYC passed proofs
  country membership proofs

services/verifier
  proof product catalog
  presentation challenge issuance
  passkey binding endpoints
  off-chain zk policy request issuance
  off-chain zk proof verification
  replay, freshness, and audience checks

packages/verifier-core
  presentation request helpers
  verifier policy helpers
  holder-binding helpers
  proof verification helpers

packages/zk-age-gate-contract
  MintraRegistry shared trust anchors
  MintraAgeGate optional per-app gate
  dedicated tsc-built contract package
```

## Credential Flow

1. the user authenticates with a Mina wallet challenge
2. the API creates a Didit session tied to that wallet
3. Didit posts the result back to Mintra through a webhook
4. Mintra stores normalized claims plus commitment-backed credential metadata
5. Mintra issues a wallet-bound Mina credential

The wallet credential is intentionally compact and policy-oriented.

The richer trust and commitment data lives in `credentialMetadata.version = "v2"` and is used by the verifier and zk proof flows.

## Verification Flows

### Presentation Flow

1. a relying party backend asks the verifier for a presentation request
2. the verifier creates:
   - proof product config
   - verifier-owned challenge
   - replay-protection metadata
3. the frontend asks the wallet to produce a presentation
4. the frontend signs the holder-binding payload with the same wallet
5. if required, the frontend completes a passkey assertion
6. the backend verifies:
   - challenge ownership
   - challenge freshness
   - replay state
   - audience match
   - credential freshness
   - holder binding
   - optional passkey binding

### ZK Proof Flow

1. the frontend resolves reusable proof material from:
   - the wallet when supported
   - the holder's local signed bundle fallback
   - the API only as a recovery path
2. the verifier issues a typed `mintra.zk-policy/v1` request
3. the frontend or API generates the matching o1js proof from `credentialMetadata.version = "v2"`
4. the verifier checks the issuer-signed proof-material bundle
5. the verifier checks the raw posted proof JSON against the compiled verification key
6. the verifier checks the raw public input array against the requested policy and signed commitments

## Off-Chain First

Mintra does not need a Mina zkApp for the current proof system to be real.

The current execution order is:

1. provider-backed KYC
2. wallet-bound credential issuance
3. holder-owned reusable proof-material storage
4. o1js proof generation off-chain
5. verifier checks the proof off-chain

That is the current product default.

## On-Chain Layer

Mintra's preferred split is:

1. one shared `MintraRegistry`
   stores common trust anchors
2. site-specific policy stays off-chain
   each relying party controls `minAge`, `requireKycPassed`, country rules, freshness, and demo-credential policy
3. optional per-app `MintraAgeGate`
   only for zkApps that need direct on-chain gating

This avoids turning one Mina contract into a global policy bottleneck for every website.

## Privacy Direction

Mintra now distinguishes:

1. source data
2. source commitments
3. derived claims

Implemented now:

- commitment-backed metadata exists
- age proofs can bind directly to a Mintra-issued DOB commitment
- KYC and country proofs have the same overall structure
- verifier policies are typed and explicit

Not implemented yet:

- full in-circuit proof of correct derivation from commitments
- on-chain revocation enforcement in the default flow
- contract-side verifier policy enforcement as the default path
