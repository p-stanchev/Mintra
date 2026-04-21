# Optional zkApp Age Gate Example

This example is intentionally optional and non-core.

It shows how a Mina app could structure an age-gated zkApp integration layer around Mintra verification results without pretending that direct in-circuit presentation verification is already productionized here.

## What This Example Demonstrates

- a clean separation between Mintra proof verification and zkApp business logic
- a placeholder contract surface for age-gated actions
- where off-chain verified results could be anchored or bridged on-chain

## What It Does Not Claim

- it does not fully verify Mintra presentations inside the circuit
- it does not implement a full revocation root
- it does not anchor verifier challenge state on-chain

Use it as an integration sketch, not as a finished production contract.
