# Credential And Proof Authenticity

This document explains what Mintra signs, what a relying party must verify, and what can still be faked if an integration is careless.

## Short Version

Mintra does not trust plain JSON.

The important trust objects are:

- the wallet credential
- the signed proof-material bundle
- the verifier-issued request or challenge
- the verifier result

If a relying party verifies those correctly, simple client-side edits should not pass.

## What Is Signed

### Wallet Credential

The Mina wallet credential is issuer-signed.

That means fields like:

- `ageOver18`
- `ageOver21`
- `kycPassed`
- `countryCode`
- `issuedAt`

should not be trusted unless the issuer signature is valid and the issuer public key is trusted.

If a user edits those values directly, the signature should no longer verify.

### Signed Proof-Material Bundle

The reusable zk artifact is the signed proof-material bundle:

- `version: "mintra.zk-proof-material/v2"`
- `walletAddress`
- `issuerPublicKey`
- `issuedAt`
- `proofMaterial`
- `issuerSignature`

This bundle is signed by the Mina issuer key configured through:

- API: `MINA_ISSUER_PRIVATE_KEY`
- verifier: `TRUSTED_ISSUER_PUBLIC_KEY`
- demo-web: `NEXT_PUBLIC_MINTRA_TRUSTED_ISSUER_PUBLIC_KEY`

If a user edits:

- `dateOfBirth`
- `kycPassed`
- `countryCode`
- source commitments
- salts

without being able to produce a new valid issuer signature, the bundle should be rejected.

## What A Verifier Must Check

For presentation-based reuse, a relying party should verify:

1. the credential or presentation proof is valid
2. the issuer is trusted
3. the proof is bound to the expected wallet holder
4. freshness, audience, and replay rules pass

For zk-proof reuse, a relying party should verify:

1. the signed proof-material bundle is valid
2. `bundle.issuerPublicKey` matches the trusted issuer key
3. `bundle.walletAddress` matches `bundle.proofMaterial.userId`
4. the zk proof itself is cryptographically valid
5. the proof commitment matches the commitment inside the signed bundle
6. the proof also matches the verifier-issued policy request

In Mintra's current HTTP surface, that means the backend should rely on:

- `POST /api/mina/verify-proof-bundle`
- `POST /api/zk/verify-proof`
- `POST /api/verify-presentation`

## What Can Be Faked

Some things can still be faked at the UX layer:

- a fake frontend pretending to "open with wallet"
- edited JSON shown in the browser
- a wallet integration that returns data the site never verifies

Those are not the real trust boundary.

The real trust boundary is:

- issuer signature validity
- trusted issuer key configuration
- wallet holder binding
- verifier-side proof checks

So:

- a fake UI can exist
- a fake bundle file can be uploaded
- a fake wallet response can be returned

but a correct verifier should still reject them if the signatures or proof bindings do not line up.

## What Can Go Wrong In A Bad Integration

The most common mistakes are:

- trusting client JSON directly
- skipping issuer signature verification
- using the wrong trusted issuer key
- trusting wallet-returned proof material without verifier checks
- accepting a stale result instead of requesting a fresh proof
- accepting demo credentials in production

Any of those mistakes weakens the system much more than the signed bundle format itself.

## Current Reuse Model

For presentations:

- the reusable object is the wallet credential

For zk proofs:

- the reusable object is the issuer-signed proof-material bundle

Current holder-controlled precedence is:

1. wallet-held proof material when the wallet exposes it
2. local or imported signed proof bundle
3. API recovery only when the holder has neither of the above

That means Mintra does not need to retain backend claim state at proof time as long as the holder already has a valid signed bundle.

## Open With Wallet

"Open with wallet" is the right long-term UX, but it is not the trust boundary by itself.

A secure wallet-native flow still needs:

1. wallet returns the credential or signed proof-material bundle
2. site sends that material to a verifier or verifies it correctly on the backend
3. verifier checks issuer identity, signature, holder binding, and proof validity

So the wallet is the transport and holder interface.
The verifier remains the authority.

## Practical Rule

Do not trust:

- displayed fields
- imported JSON
- wallet-returned proof material by itself

Only trust:

- a valid issuer-signed credential
- a valid issuer-signed proof-material bundle
- a valid verifier result bound to the current holder and request

## Related Docs

- [security.md](./security.md)
- [security-considerations.md](./security-considerations.md)
- [verifier-integration.md](./verifier-integration.md)
- [zk-proofs-and-registry.md](./zk-proofs-and-registry.md)
