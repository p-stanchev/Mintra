# Mintra Architecture

## Proposed Architecture

Mintra stays infrastructure-first.

The core product is:

1. wallet authentication
2. KYC orchestration and claim normalization
3. wallet-bound Mina credential issuance
4. verifier-owned presentation requests
5. off-chain proof verification with holder binding
6. off-chain o1js selective-disclosure proof verification

Optional on top of that:

7. zkApp integration helpers
8. example on-chain enforcement contracts

## Current Layering

```text
┌────────────────────────────────────────────────────────────────────┐
│  apps/demo-web                                                     │
│  - wallet onboarding                                               │
│  - KYC start / callback                                            │
│  - protected route                                                 │
│  - verifier playground                                             │
│  - relying party demo                                              │
└───────────────────────────────┬────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  services/api                                                      │
│  - wallet auth challenge / verify                                  │
│  - Didit session creation                                          │
│  - Didit webhook ingestion                                         │
│  - normalized claims storage                                       │
│  - Mina credential issuance into Auro                              │
│  - Pallad wallet connection (demo only; no proof/storage flow)     │
└───────────────┬───────────────────────────────┬────────────────────┘
                │                               │
┌───────────────▼──────────────┐   ┌────────────▼────────────────────┐
│ packages/provider-didit      │   │ packages/mina-bridge            │
│ - provider session creation  │   │ - normalized claims -> Mina VC  │
│ - webhook verification       │   │ - issuer signing                │
│ - claim normalization        │   │ - wallet credential JSON        │
└───────────────┬──────────────┘   └─────────────────────────────────┘
                │
┌───────────────▼──────────────┐
│ packages/credential-v2       │
│ - credential v2 schema       │
│ - source commitment helpers  │
│ - derived claim metadata     │
└──────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ packages/zk-claims                                                │
│ - o1js proof programs                                             │
│ - age-threshold selective disclosure                              │
│ - off-chain Mina-compatible proof foundation                      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  services/verifier                                                 │
│  - proof product catalog                                           │
│  - presentation request issuance                                   │
│  - challenge service                                               │
│  - memory store for local dev                                      │
│  - Redis store for production                                      │
│  - atomic single-use challenge consume                             │
│  - passkey binding registration / assertion option issuance        │
│  - wallet + passkey holder-binding verification                    │
│  - audience / freshness / replay checks                            │
│  - proof acceptance / denial result                                │
└───────────────────────────────┬────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  packages/verifier-core                                            │
│  - proof product configs                                           │
│  - presentation request builder                                    │
│  - stable presentation envelope format                             │
│  - holder-binding message builder                                  │
│  - proof verification helpers                                      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  packages/zk-age-gate-contract                                     │
│  - MintraRegistry shared trust anchors                             │
│  - MintraAgeGate optional per-app on-chain enforcement             │
│  - dedicated tsc-built zk contract package                         │
│  - deploy / keygen scripts                                         │
└────────────────────────────────────────────────────────────────────┘
```

## Credential Flow

1. The user authenticates with a signed Mina wallet challenge.
2. The API creates a Didit session tied to the authenticated wallet.
3. Didit completes the KYC workflow and posts a webhook to Mintra.
4. Mintra stores normalized claims, commitment metadata, derived-claim trust metadata, and minimal verification metadata.
5. Mintra signs a Mina credential and the user stores it in Auro.

## Presentation Flow

1. A relying party backend asks the verifier to create a presentation request.
2. The verifier creates:
   - a proof product specific request
   - a verifier-owned challenge
   - single-use replay protection metadata
   - a persisted challenge record in memory or Redis
3. The frontend asks Auro to generate a Mina presentation.
4. The frontend asks the same wallet to sign a holder-binding message for that exact proof.
5. If the policy requires passkeys, the frontend asks the verifier for WebAuthn assertion options and signs a payload bound to the same challenge and `proof_sha256`.
5. The backend verifies:
   - the challenge was issued by this verifier
   - the challenge is not expired
   - the challenge has not already been used
   - challenge consume succeeds atomically across verifier instances
   - the Mina proof is valid
   - the audience matches
   - the credential freshness policy passes
   - the wallet holder-binding signature matches the proof owner
   - the passkey assertion matches the registered device binding when required

## Challenge Storage

Verifier challenge state is now behind a storage adapter:

- `MemoryPresentationChallengeStore`
- `RedisPresentationChallengeStore`

The memory store keeps local development simple.

The Redis store is the production path because it allows:

- shared challenge visibility across verifier instances
- atomic challenge consumption
- stronger replay resistance in horizontally scaled deployments

## Holder-Binding Model

Mintra now treats holder binding as a first-class verification layer.

The wallet signs a message that includes:

- `challenge_id`
- `nonce`
- `audience`
- `verifier`
- `action`
- `owner`
- `proof_sha256`
- `issued_at`
- `expires_at`

The optional passkey layer signs a verifier-issued WebAuthn challenge that is derived from:

- `challenge_id`
- `nonce`
- `audience`
- `proof_sha256`
- wallet / subject binding context

That gives the verifier a realistic challenge-response flow that prevents:

- simple replay of an old presentation bundle
- cross-audience proof reuse
- reusing a proof after the verifier marks the challenge as consumed
- presenting a proof for one wallet and a holder signature from another

It does not claim to solve:

- malware on the holder device
- real-time man-in-the-browser compromise
- full anti-collusion guarantees

Those remain future production-hardening work, alongside multi-device recovery and policy tooling.

## Why This Is Not “Just a zkApp”

Mintra’s core value is not a single on-chain contract. It is the reusable verification infrastructure around:

- provider integration
- wallet auth
- claim normalization
- credential issuance
- proof product design
- verifier-side consumption

The zkApp layer is therefore optional and modular.

## Off-Chain zk Path Before Any Contract

Mintra does not need a deployed Mina contract for the current zk path.

The intended execution order is:

1. provider-backed KYC
2. wallet-bound credential issuance
3. o1js proof generation off-chain
4. verifier checks the proof off-chain

That already gives Mintra a real selective-disclosure infrastructure path without forcing every integration into a zkApp.

Only after that should Mintra add an optional on-chain layer for:

- issuer registry anchoring
- revocation roots
- accepted verification-key roots
- optional per-app zkApp-native policy enforcement

## Shared Registry, Site Policy, Optional App Gate

Mintra's preferred on-chain shape is now:

1. one shared `MintraRegistry`
   stores common trust anchors
2. site-specific policy stays off-chain
   each relying party keeps control of `minAge`, `requireKycPassed`, country rules, freshness, and demo-credential policy
3. optional per-app `MintraAgeGate`
   only for zkApps that need direct on-chain action gating

This avoids turning one Mina contract into a global policy bottleneck for every website.

## Minimal ZK / Privacy Direction

Mintra’s privacy roadmap is intentionally lightweight but Mina-native:

- selective disclosure over normalized claims
  for example, proving `age_over_18` without exposing full date of birth
- claim commitments
  where appropriate, storing and transporting committed claim values instead of broader plaintext fields
- future zk-proof compatibility
  keeping credential formats, proof products, and verifier outputs structured so they can map into stronger zero-knowledge verification paths later

This should be read as architectural direction rather than current full in-circuit functionality.

## Committed Claims Foundation

Mintra now distinguishes between three layers of verification data:

1. source data
   raw provider facts such as date of birth or issuing country
2. source commitments
   deterministic hashes of sensitive source values such as `dob_commitment`
3. derived claims
   product-facing outputs such as `age_over_18`, `age_over_21`, `kyc_passed`, and `country_code`

The current implementation uses commitments plus derived claims as the storage and issuance foundation for future privacy upgrades.

What is implemented now:

- source commitments can be generated from sensitive fields
- issued credential metadata can now carry a zk-friendly `dob_poseidon_commitment` for age proofs
- derived claims are computed from provider results
- derived claims carry derivation method, version, assurance, and evidence metadata
- credentials can be labeled as production or demo through issuer-environment metadata
- Mintra persists derived claims and commitment metadata instead of raw source identity fields
- the first age proof helper can derive its public input directly from Mintra-issued `credentialMetadata.version === "v2"`

What is not implemented yet:

- zk proof of correct derivation from a commitment
- in-circuit commitment checks
- full cryptographic selective disclosure of source-field relations
- on-chain registry or revocation anchoring as part of the core flow
