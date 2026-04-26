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
- issuer-signed proof-material bundle validity for zk proof flows
- raw o1js proof JSON against the compiled verification key for zk proof products
- raw zk public input values against the requested verifier policy
- raw zk public input commitments against the signed proof-material bundle

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

For reusable zk proving, the preferred holder-controlled inputs are:

1. wallet-held signed proof material
2. local or imported signed proof bundle
3. API recovery only when the holder has neither of the above

Mintra's on-chain registry does not change this default. The registry anchors shared trust data, while the main verifier decision still happens off-chain.
