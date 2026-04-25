# zk Contracts Package

This page mirrors the important parts of the `@mintra/zk-contracts` package README so the generated docs site can link to it directly.

## What The Package Contains

- `MintraRegistry` shared trust-anchor contract
- `MintraAgeGate` optional per-app age/KYC enforcement contract
- dynamic proof wrappers for on-chain age and KYC proof submission
- local compile smoke scripts
- key generation scripts
- registry deploy and update scripts
- age-gate deploy and policy update scripts

## Recommended Architecture

Use the contracts like this:

1. `MintraRegistry`
   shared on-chain trust anchors
2. site-specific policy off-chain
   each relying party keeps its own verifier policy
3. `MintraAgeGate`
   optional per-app contract only if a zkApp truly needs direct on-chain enforcement

This keeps Mintra infrastructure-first and avoids forcing every integration through one global on-chain policy.

## Shared Registry

`MintraRegistry` stores:

- trusted Mintra issuer public key
- accepted age proof VK hash
- accepted KYC proof VK hash
- accepted country proof VK hash
- credential root
- revocation root

That makes it a shared anchor contract rather than a one-policy-for-everyone gate.

## Optional Age Gate

`MintraAgeGate` can currently enforce:

- `minAge`
- `requireKycPassed`

That means one app can use:

- `18+`

while another uses:

- `21+ and KYC passed`

Country rules still stay off-chain.

## Common Commands

Local compile:

```bash
pnpm --filter @mintra/zk-contracts compile:local
```

Generate keys:

```bash
pnpm --filter @mintra/zk-contracts gen-keys > keys.json
```

Deploy the shared registry:

```bash
pnpm --filter @mintra/zk-contracts run deploy
```

Deploy the optional age gate:

```bash
pnpm --filter @mintra/zk-contracts run deploy:age-gate
```

## See Also

- [zk-proofs-and-registry.md](./zk-proofs-and-registry.md)
- [zkapp-integration.md](./zkapp-integration.md)
- [zkapp-age-gate-example.md](./zkapp-age-gate-example.md)
