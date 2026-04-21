# Mintra Architecture

## Proposed Architecture

Mintra stays infrastructure-first.

The core product is:

1. wallet authentication
2. KYC orchestration and claim normalization
3. wallet-bound Mina credential issuance
4. verifier-owned presentation requests
5. off-chain proof verification with holder binding

Optional on top of that:

6. zkApp integration helpers
7. example on-chain enforcement contracts

## Current Layering

```text
┌────────────────────────────────────────────────────────────────────┐
│  apps/demo-web                                                    │
│  - wallet onboarding                                              │
│  - KYC start / callback                                           │
│  - protected route                                                │
│  - verifier playground                                            │
│  - relying party demo                                             │
└───────────────────────────────┬────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  services/api                                                     │
│  - wallet auth challenge / verify                                 │
│  - Didit session creation                                         │
│  - Didit webhook ingestion                                        │
│  - normalized claims storage                                      │
│  - Mina credential issuance into Auro                             │
│  - Pallad wallet connection (demo only; no proof/storage flow)   │
└───────────────┬───────────────────────────────┬────────────────────┘
                │                               │
┌───────────────▼──────────────┐   ┌────────────▼────────────────────┐
│ packages/provider-didit      │   │ packages/mina-bridge            │
│ - provider session creation  │   │ - normalized claims -> Mina VC  │
│ - webhook verification       │   │ - issuer signing                │
│ - claim normalization        │   │ - wallet credential JSON        │
└──────────────────────────────┘   └─────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  services/verifier                                                │
│  - proof product catalog                                          │
│  - presentation request issuance                                  │
│  - challenge service                                               │
│  - memory store for local dev                                      │
│  - Redis store for production                                      │
│  - atomic single-use challenge consume                             │
│  - passkey binding registration / assertion option issuance       │
│  - wallet + passkey holder-binding verification                   │
│  - audience / freshness / replay checks                           │
│  - proof acceptance / denial result                               │
└───────────────────────────────┬────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────┐
│  packages/verifier-core                                           │
│  - proof product configs                                          │
│  - presentation request builder                                   │
│  - stable presentation envelope format                            │
│  - holder-binding message builder                                 │
│  - proof verification helpers                                     │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  examples/zkapp-age-gate                                          │
│  - optional zkApp consumption example                             │
│  - not core to issuance or off-chain verification                 │
└────────────────────────────────────────────────────────────────────┘
```

## Credential Flow

1. The user authenticates with a signed Mina wallet challenge.
2. The API creates a Didit session tied to the authenticated wallet.
3. Didit completes the KYC workflow and posts a webhook to Mintra.
4. Mintra stores only normalized claims and minimal verification metadata.
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
