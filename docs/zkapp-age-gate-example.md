# zkApp Age Gate Example

This page mirrors the optional `examples/zkapp-age-gate` README so the generated docs site has a clean route for it.

## What This Example Demonstrates

- a clean separation between Mintra proof verification and zkApp business logic
- how the shared registry and optional per-app gate fit together
- where off-chain verified results could be anchored or bridged on-chain

## What It Does Not Claim

- it does not fully verify Mintra presentations inside the circuit
- it does not implement a full revocation root
- it does not anchor verifier challenge state on-chain

Treat it as an integration sketch, not as a finished production contract.

## Current Package Layout

The actual contract code and deploy scripts live in:

- [zk-contracts-package.md](./zk-contracts-package.md)

Use the contracts package for:

- local contract compilation
- key generation
- Mina deploys

This example remains a lightweight integration surface and documentation hook.

## See Also

- [zkapp-integration.md](./zkapp-integration.md)
- [zk-proofs-and-registry.md](./zk-proofs-and-registry.md)
- [zk-contracts-package.md](./zk-contracts-package.md)
