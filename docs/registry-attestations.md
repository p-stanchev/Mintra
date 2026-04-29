# Registry Attestations

Mintra can now anchor privacy-preserving claim commitments on Mina without publishing raw claims on-chain.

## Model

Off-chain the holder keeps:

- the credential or signed proof-material bundle
- private claim attestations
- salts and Merkle proofs that tie those attestations to the current registry roots

On-chain `MintraRegistry` still stores only shared trust anchors:

- trusted issuer public key
- proof-program VK hashes
- `credentialRoot`
- `revocationRoot`

## Claim attestation format

Each private attestation contains:

- `claimType`
- `value`
- `subjectHash`
- `issuerPublicKey`
- `expiresAt`
- `salt`
- `commitment`

The commitment is generated from all of those fields, so changing the visible claim value breaks the attestation.

## Registry roots

Mintra now treats the registry roots like this:

- `credentialRoot`
  - Merkle root over active attestation commitments
- `revocationRoot`
  - Merkle root over revocation-status leaves of the form:
  - `commitment + revoked`

That lets a verifier check both:

1. the commitment exists in the active credential root
2. the commitment currently resolves to `revoked: false` in the revocation-status root

## Publish flow

Operator flow:

1. issue a credential or signed proof-material bundle
2. collect the claim commitment to anchor
3. publish it into the registry state file
4. recompute `credentialRoot` and `revocationRoot`
5. update `MintraRegistry`

Scripts:

```bash
pnpm --filter @mintra/zk-contracts publish:attestation
pnpm --filter @mintra/zk-contracts revoke:attestation
```

Required env:

- `DEPLOYER_PRIVATE_KEY`
- `ZKAPP_PRIVATE_KEY`
- `ZKAPP_ADDRESS`
- `MINA_GRAPHQL_URL`
- `TRUSTED_ISSUER_PUBLIC_KEY`
- `ATTESTATION_COMMITMENT`

Optional:

- `REGISTRY_ATTESTATIONS_FILE`
- `MINA_ARCHIVE_URL`

## Verifier flow

`verifyPresentationWithRegistry()` layers registry checks on top of normal Mintra presentation verification:

1. verify the presentation and holder binding
2. load the registry from Mina GraphQL
3. verify each required claim attestation commitment
4. verify the credential-root inclusion proof
5. verify the revocation-root status proof
6. check issuer, subject hash, expiry, and claim-value alignment

This makes the verifier trust:

- the private off-chain attestation record
- the on-chain registry roots
- the issuer key anchored in the registry

## Encrypted local storage

`@mintra/sdk-js` now exposes:

- `encryptCredentialBackup()`
- `decryptCredentialBackup()`

These helpers encrypt a signed proof-material bundle with:

- `AES-GCM`
- `PBKDF2-SHA256`

That gives Mintra a portable encrypted backup format for browser storage or downloadable recovery files.

## Current limitation

This implementation adds registry-backed commitment and revocation enforcement, but registry publication is still an operator-managed root update flow. Mintra does not yet automatically push newly issued commitments on-chain at issuance time.
