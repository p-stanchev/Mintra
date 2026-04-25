# zkApp Integration

zkApp support is optional.

Mintra is not a zkApp-only product.

## Current Position

Today Mintra:

- issues credentials off-chain
- verifies presentations off-chain
- verifies o1js proof products off-chain
- anchors shared trust data on-chain through `MintraRegistry`

That means Mina contracts are an extension layer, not the default execution path.

## Preferred Split

Mintra's preferred Mina-native split is:

1. one shared on-chain registry for trust anchors
2. site-specific verifier policy off-chain
3. optional per-app enforcement contract only when a zkApp truly needs direct on-chain gating

That split avoids one global on-chain policy for every site.

## What The Registry Does

`MintraRegistry` stores:

- trusted issuer public key
- accepted proof verification key hashes
- credential root
- revocation root

It does not store:

- date of birth
- country
- provider payloads
- site-specific verifier rules

## What The Optional App Gate Does

`MintraAgeGate` is the optional per-app contract.

Use it only when a Mina zkApp really needs direct on-chain checks such as:

- minimum age gating
- age plus KYC gating

Site-specific policy can otherwise stay off-chain in the verifier service.

## Demo-Web Integration

The demo web can surface the deployed registry by setting:

- `NEXT_PUBLIC_MINTRA_ZKAPP_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_MINA_GRAPHQL_URL`

The `/zk-age` page then reads the registry account from Mina GraphQL and shows the anchored VK hashes and roots.

## What Is Implemented vs Placeholder

Implemented:

- off-chain verifier product flow
- off-chain zk policy request flow
- shared `MintraRegistry`
- optional `MintraAgeGate`

Placeholder / future work:

- contract-side verifier policy enforcement as a default path
- on-chain challenge consumption
- contract-side freshness enforcement
- on-chain country policy enforcement
- revocation-root lifecycle as a production default

## References

- [zk-proofs-and-registry.md](./zk-proofs-and-registry.md)
- [zk-contracts-package.md](./zk-contracts-package.md)
- [zkapp-age-gate-example.md](./zkapp-age-gate-example.md)
