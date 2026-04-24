# `@mintra/zk-age-gate-contract`

Optional Mina zkApp contract package for Mintra's on-chain policy-gated example.

This package is intentionally separate from `@mintra/zk-claims` so the contract can be built with plain TypeScript compiler output instead of `tsup` / `tsx`.

## What It Contains

- `MintraAgeGate` smart contract
- `AgeClaimDynamicProof` wrapper for on-chain age proof submission
- `KycPassedDynamicProof` wrapper for on-chain KYC proof submission
- local compile smoke script
- key generation script
- deploy script
- policy update script

## Current On-Chain Policy Surface

This contract can currently enforce:

- `minAge`
- `requireKycPassed`

That means one app can deploy a contract instance for:

- `18+`

and another can deploy or update an instance for:

- `21+` and `KYC passed`

Country rules are still off-chain today.

## Local Compile

```bash
pnpm --filter @mintra/zk-age-gate-contract compile:local
```

## Generate Keys

```bash
pnpm --filter @mintra/zk-age-gate-contract gen-keys > keys.json
```

## Deploy

```bash
pnpm --filter @mintra/zk-age-gate-contract deploy
```

Required environment variables:

- `DEPLOYER_PRIVATE_KEY`
- `ZKAPP_PRIVATE_KEY`
- `MINA_GRAPHQL_URL`

Optional:

- `MINA_ARCHIVE_URL`
- `MIN_AGE` (defaults to `18`)
- `REQUIRE_KYC_PASSED` (`true` / `false`, defaults to `false`)

## Update Policy

```bash
pnpm --filter @mintra/zk-age-gate-contract update-policy
```

Required environment variables for policy updates:

- `DEPLOYER_PRIVATE_KEY`
- `ZKAPP_PRIVATE_KEY`
- `ZKAPP_ADDRESS`
- `MINA_GRAPHQL_URL`

Optional:

- `MINA_ARCHIVE_URL`
- `MIN_AGE`
- `REQUIRE_KYC_PASSED`
