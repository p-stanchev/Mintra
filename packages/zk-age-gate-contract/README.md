# `@mintra/zk-contracts`

Optional Mina zkApp contract package for Mintra's on-chain trust-anchor and policy-gated examples.

This package is intentionally separate from `@mintra/zk-claims` so the contracts can be built with plain TypeScript compiler output instead of `tsup` / `tsx`.

## What It Contains

- `MintraRegistry` shared trust-anchor contract
- `MintraAgeGate` optional per-app age/KYC enforcement contract
- `AgeClaimDynamicProof` wrapper for on-chain age proof submission
- `KycPassedDynamicProof` wrapper for on-chain KYC proof submission
- local compile smoke script
- key generation script
- registry deploy / update scripts
- age-gate deploy / policy update scripts

## Recommended Architecture

Use the contracts like this:

1. `MintraRegistry`
   shared on-chain trust anchors
2. site-specific policy off-chain
   each relying party chooses its own Mintra verifier policy
3. `MintraAgeGate`
   optional per-app contract only if a zkApp needs direct on-chain enforcement

This keeps Mintra infrastructure-first and avoids forcing every integration through a single shared on-chain policy.

In the current reusable model, relying parties primarily trust:

- the holder wallet
- the issuer-signed proof-material bundle
- verifier-side policy and proof checks
- optional shared registry anchors on-chain

## Shared Registry

`MintraRegistry` stores:

- trusted Mintra issuer public key
- accepted age proof VK hash
- accepted KYC proof VK hash
- accepted country proof VK hash
- credential root
- revocation root

That makes it a shared anchor contract rather than a one-policy-for-everyone gate.

In the current Mintra architecture, the registry is the preferred first on-chain deployment. The main verifier decision still happens off-chain.

## Optional Age Gate

The optional `MintraAgeGate` contract can currently enforce:

- `minAge`
- `requireKycPassed`

That means one app can deploy a contract instance for:

- `18+`

and another can deploy or update an instance for:

- `21+` and `KYC passed`

Country rules are still off-chain today.

## Current Recommendation

Start with:

1. `MintraRegistry`
2. site-specific verifier policy off-chain

Use `MintraAgeGate` only when a Mina zkApp really needs direct on-chain gating.

## Local Compile

```bash
pnpm --filter @mintra/zk-contracts compile:local
```

## Generate Keys

```bash
pnpm --filter @mintra/zk-contracts gen-keys > keys.json
```

## Deploy Shared Registry

```bash
pnpm --filter @mintra/zk-contracts deploy
```

Required environment variables:

- `DEPLOYER_PRIVATE_KEY`
- `ZKAPP_PRIVATE_KEY`
- `MINA_GRAPHQL_URL`
- `TRUSTED_ISSUER_PUBLIC_KEY`

Optional:

- `MINA_ARCHIVE_URL`
- `CREDENTIAL_ROOT` (defaults to `0`)
- `REVOCATION_ROOT` (defaults to `0`)

## Update Shared Registry

```bash
pnpm --filter @mintra/zk-contracts update:registry
```

Required environment variables for registry updates:

- `DEPLOYER_PRIVATE_KEY`
- `ZKAPP_PRIVATE_KEY`
- `ZKAPP_ADDRESS`
- `MINA_GRAPHQL_URL`
- `TRUSTED_ISSUER_PUBLIC_KEY`

Optional:

- `MINA_ARCHIVE_URL`
- `CREDENTIAL_ROOT`
- `REVOCATION_ROOT`

## Deploy Optional Age Gate

```bash
pnpm --filter @mintra/zk-contracts deploy:age-gate
```

Required environment variables:

- `DEPLOYER_PRIVATE_KEY`
- `ZKAPP_PRIVATE_KEY`
- `MINA_GRAPHQL_URL`

Optional:

- `MINA_ARCHIVE_URL`
- `MIN_AGE` (defaults to `18`)
- `REQUIRE_KYC_PASSED` (`true` / `false`, defaults to `false`)

## Update Optional Age Gate Policy

```bash
pnpm --filter @mintra/zk-contracts update:age-gate-policy
```

Required environment variables:

- `DEPLOYER_PRIVATE_KEY`
- `ZKAPP_PRIVATE_KEY`
- `ZKAPP_ADDRESS`
- `MINA_GRAPHQL_URL`

Optional:

- `MINA_ARCHIVE_URL`
- `MIN_AGE`
- `REQUIRE_KYC_PASSED`
