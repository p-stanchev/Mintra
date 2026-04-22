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
5. selective presentation verification
6. verifier-side replay and audience protection
7. claim trust and issuer-environment metadata

Mintra’s current core product is off-chain credential issuance and off-chain proof verification.

That includes distinguishing:

- production credentials vs demo credentials
- provider-normalized vs locally-derived vs future zk-proven evidence

Optional zkApp integrations sit on top of that core, rather than replacing it.
