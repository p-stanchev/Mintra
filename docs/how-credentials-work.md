# How Credentials Work

## Input

Mintra receives a verified KYC decision from Didit.

It does not store the raw KYC payload permanently. Instead it now splits the result into:

- source commitments:
  deterministic hashes of sensitive fields such as date of birth or country source values
- derived claims:
  normalized, product-facing claims required for proof products

Examples of derived claims:

- `kyc_passed`
- `age_over_18`
- `age_over_21`
- `country_code`

Examples of source commitments:

- `dob_commitment`
- `country_code_commitment`

## Issuance

Mintra maps those normalized claims into a Mina credential shape and signs it through the Mina bridge.

The wallet-bound credential includes:

- `ageOver18`
- `ageOver21`
- `kycPassed`
- `countryCode`
- `nationalityCode`
- `documentExpiresAt`
- `isDemoCredential`
- `credentialMode`
- `assuranceLevel`
- `evidenceClass`
- `issuedAt`

The signed credential is then stored in Auro.

In the current demo build, Pallad can be connected as a wallet, but credential storage is not supported there yet.

## Source Data vs Commitments vs Derived Claims

- source data:
  provider-side identity facts such as date of birth
- source commitments:
  hashes of those sensitive values that can later support stronger proof systems
- derived claims:
  public claims Mintra actually uses in today’s credential and verifier flows

Today, Mintra enforces the derived claims.

It does not yet prove cryptographically that each derived claim was generated correctly from its commitment inside a zk circuit. That is future work.

## Derived Claim Metadata

Each derived claim can now carry structured metadata such as:

- `derivedFrom`
- `derivationMethod`
- `derivationVersion`
- `assuranceLevel`
- `evidenceClass`

That lets verifiers distinguish between:

- provider-normalized claims
- locally-derived claims
- future zk-proven claims

## Demo vs Production Credentials

Issued credential metadata can now also label the issuer environment:

- production credentials
- demo credentials

This matters because a verifier may want to reject demo credentials entirely in production while still allowing them in local testing or playground flows.

## Retention vs Freshness

- retention: how long Mintra keeps normalized backend claims
- freshness: how long a verifier should treat the credential as acceptable

Mintra currently:

- retains normalized claims for up to 30 days in the current setup
- allows apps to require fresher credentials with verifier policy
- supports re-verification even before retention expiry

When a new verification succeeds, Mintra overwrites the older claim state.
