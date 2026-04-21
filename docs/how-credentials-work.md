# How Credentials Work

## Input

Mintra receives a verified KYC decision from Didit.

It does not store the raw KYC payload permanently. Instead it normalizes only the fields required for proof products, such as:

- `kyc_passed`
- `age_over_18`
- `age_over_21`
- `country_code`

## Issuance

Mintra maps those normalized claims into a Mina credential shape and signs it through the Mina bridge.

The wallet-bound credential includes:

- `ageOver18`
- `ageOver21`
- `kycPassed`
- `countryCode`
- `issuedAt`

The signed credential is then stored in Auro.

In the current demo build, Pallad can be connected as a wallet, but credential storage is not supported there yet.

## Retention vs Freshness

- retention: how long Mintra keeps normalized backend claims
- freshness: how long a verifier should treat the credential as acceptable

Mintra currently:

- retains normalized claims for up to 30 days
- allows apps to require fresher credentials with verifier policy
- supports re-verification even before retention expiry

When a new verification succeeds, Mintra overwrites the older claim state.
