# ZK Proofs and Registry

## Current Model

Mintra's current zk path is:

1. KYC completes through Didit
2. Mintra issues commitment-backed credential metadata
3. the holder generates an o1js proof off-chain
4. the verifier checks that proof off-chain
5. Mintra optionally anchors shared trust data on-chain through `MintraRegistry`

This means Mintra is **off-chain first**:

- proofs are generated off-chain
- proofs are verified off-chain
- the on-chain registry stores shared trust anchors, not the full verifier policy

## Supported ZK Proof Types

Mintra currently exposes:

- `mintra.zk.age-threshold/v1`
- `mintra.zk.kyc-passed/v1`
- `mintra.zk.country-membership/v1`

The verifier creates requests with:

- `POST /api/zk/policy-request`

The verifier checks returned proofs with:

- `POST /api/zk/verify-proof`

## Credential Binding

The proof path is bound to `credentialMetadata.version === "v2"`.

Current commitment keys include:

- `dob_poseidon_commitment`
- `kyc_passed_poseidon_commitment`
- `country_code_poseidon_commitment`

The browser demo page requests authenticated prover input from the API, then uses that commitment-backed metadata to generate the matching proof.

## Registry

`MintraRegistry` is the shared on-chain trust-anchor contract.

It stores:

- trusted issuer public key
- accepted age proof verification key hash
- accepted KYC proof verification key hash
- accepted country proof verification key hash
- credential root
- revocation root

The registry does **not** store:

- date of birth
- country
- raw provider results
- wallet-specific verifier policy

## Site Policy vs On-Chain Anchors

Mintra's preferred split is:

1. shared trust anchors on-chain
2. site-specific verifier policy off-chain
3. optional per-app zkApp gate only when a zkApp truly needs direct on-chain enforcement

That means one site can request:

- `18+`

while another requests:

- `21+ and KYC passed`

without forcing a single shared on-chain policy for every app.

## Demo-Web Integration

The demo web can show the deployed registry if these env vars are set:

```env
NEXT_PUBLIC_MINTRA_ZKAPP_REGISTRY_ADDRESS=...
NEXT_PUBLIC_MINA_GRAPHQL_URL=https://api.minascan.io/node/devnet/v1/graphql
```

The `/zk-age` page then reads the registry account from Mina GraphQL and displays the anchored hashes and root slots.

The `/zk-age` page now prefers authenticated backend proving through the API and only falls back to browser-side proving when that API route is unavailable.

## Browser Runtime Requirement

Browser-side `o1js` proving requires a cross-origin isolated runtime so workers can use `SharedArrayBuffer`.

The app should serve:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless`

Without those headers, the page should still load, but browser-side proving will be unavailable.

## See Also

- [zkapp-integration.md](./zkapp-integration.md)
- [zk-contracts-package.md](./zk-contracts-package.md)
- [zkapp-age-gate-example.md](./zkapp-age-gate-example.md)
