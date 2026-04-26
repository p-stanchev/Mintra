# Optional zkApp Age Gate Example

This example is intentionally optional and non-core.

It shows how a Mina app could structure an optional on-chain enforcement layer around Mintra verification results without pretending that direct in-circuit presentation verification is already productionized here.

The reusable holder state for the current zk flow remains off-chain:

- wallet-held proof material when supported
- signed proof-bundle fallback otherwise

## What This Example Demonstrates

- a clean separation between Mintra proof verification and zkApp business logic
- how the shared registry and optional per-app gate fit together
- where off-chain verified results could be anchored or bridged on-chain

## What It Does Not Claim

- it does not fully verify Mintra presentations inside the circuit
- it does not implement a full revocation root
- it does not anchor verifier challenge state on-chain

Use it as an integration sketch, not as a finished production contract.

## Current Package Layout

The actual contract code and deploy scripts now live in:

- [`packages/zk-age-gate-contract`](../../packages/zk-age-gate-contract)

Use that package for:

- local contract compilation
- key generation
- Mina deploys

This `examples/zkapp-age-gate` folder remains as a lightweight example surface and documentation hook.
