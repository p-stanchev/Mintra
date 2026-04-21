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
