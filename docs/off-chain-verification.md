# Off-Chain Verification

Off-chain verification is the current product default.

That is intentional.

## Why Off-Chain First

- web apps need it
- backends need it
- not every relying party is a zkApp
- verifier policies change faster than on-chain contracts
- proof workloads are expensive and easier to iterate off-chain first

## What Gets Verified Off-Chain

- Mina presentation validity
- holder-binding wallet signature
- challenge freshness
- replay protection
- audience match
- credential freshness

## Output Shape

`verifyPresentation(...)` returns a normalized result object that backend developers can consume directly:

- `ok`
- `challenge`
- `ownerPublicKey`
- `output`
- `holderBinding`
- `audience`
- `freshness`
- `error`
- `verifiedAt`

This keeps verifier integration stable even if internal proof mechanics evolve.
