# What Is Mintra?

Mintra is reusable verification infrastructure for Mina.

It is not just:

- a KYC wrapper
- a wallet login flow
- a single verifier microservice
- a zkApp for the sake of having a zkApp

Mintra combines:

1. wallet authentication
2. KYC provider orchestration
3. normalized claim extraction
4. Mina credential issuance
5. issuer-signed reusable proof-material bundles for zk proving
6. selective presentation verification
7. verifier-side replay and audience protection
8. claim trust and issuer-environment metadata

Mintra’s current core product is off-chain credential issuance and off-chain proof verification.

For zk proving reuse, the holder controls the reusable proof material:

- wallet-native when supported
- local signed-bundle fallback otherwise
- no required Mintra online claim state at proof time when valid signed proof material is already held

That includes distinguishing:

- production credentials vs demo credentials
- provider-normalized vs locally-derived vs future zk-proven evidence

Optional zkApp integrations sit on top of that core, rather than replacing it.
