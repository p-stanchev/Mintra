# zkApp Integration

zkApp support is optional.

Mintra is not redesigned into a zkApp-only product.

## Current Position

Mintra issues credentials and verifies proofs off-chain.

zkApps can consume Mintra outputs through:

- backend-mediated gating
- oracle / attestation bridging
- future contract adapters

## Example Included

See:

- [../examples/zkapp-age-gate/README.md](../examples/zkapp-age-gate/README.md)

That example is intentionally minimal and clearly marked as a scaffold.

## What Is Implemented vs Placeholder

Implemented:

- proof product modeling
- presentation envelope format
- off-chain verification path
- relying-party verifier flow

Placeholder / future work:

- in-circuit verification of Mintra presentations
- revocation roots
- on-chain challenge consumption
- contract-side freshness enforcement

The example contract shows where those integration points would live without pretending they already exist in production.

## Privacy Roadmap Hook

The zkApp extension path is also where Mintra’s privacy posture can deepen over time:

- selective disclosure for claims such as `age_over_18`
- commitment-oriented claim representations
- stronger claim assurance semantics such as `provider-normalized` vs `zk-proven`
- stronger Mina-native zk verification paths for relying parties that need on-chain enforcement

That roadmap keeps the current infrastructure-first model intact while leaving a credible path toward stronger privacy guarantees.
