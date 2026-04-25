# Mintra Roadmap

## Current

Implemented today:

- Didit session creation and webhook processing
- normalized claim storage for:
  - `date_of_birth`
  - `age_over_18`
  - `age_over_21`
  - `kyc_passed`
  - `country_code`
  - optional `nationality`
  - optional `document_expires_at`
- wallet-first auth flow
- wallet-bound Mina credential issuance
- richer wallet credential fields for trust and policy metadata
- `credentialMetadata.version = "v2"` commitment-backed metadata
- off-chain zk proof programs for:
  - `mintra.zk.age-threshold/v1`
  - `mintra.zk.kyc-passed/v1`
  - `mintra.zk.country-membership/v1`
- verifier-issued zk policy requests
- off-chain zk proof verification in `services/verifier`
- shared on-chain `MintraRegistry`
- optional per-app `MintraAgeGate`
- demo-web registry readout from Mina GraphQL
- passkey-enhanced holder binding

## Next

### Product hardening

- finish mobile polish across all demo surfaces
- add clearer verifier error surfacing everywhere
- add deployment-level health and build markers
- improve browser-side proving fallback behavior

### Credential and verifier flows

- credential reissue flow for stale wallet credentials
- stronger verifier-side credential trust checks against the registry
- revocation and suspension model for issued credentials
- issuer rotation and multi-issuer trust support
- better passkey lifecycle UX

### ZK proof surface

- prove KYC and country flows end to end in the same reliability tier as age proofs
- tighten browser/runtime checks for o1js worker usage
- bind more verifier policy fields directly into proof workflows
- extend commitment-backed metadata beyond the current source fields

### On-chain layer

- registry update lifecycle docs and automation
- revocation root lifecycle
- credential root lifecycle
- accepted verification-key rotation
- optional app-specific zkApp policies only where on-chain enforcement is actually needed

### Ecosystem and packaging

- publish stable workspace packages with semver
- add deployment templates for verifier and demo-web
- expand Mina app integration examples
