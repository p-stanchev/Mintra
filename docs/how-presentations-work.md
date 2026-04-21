# How Presentations Work

Mintra presentations are first-class artifacts.

They are not just raw proof strings.

## Format

A presentation is submitted as `mintra.presentation/v1` and includes:

- challenge metadata
- proof payload
- wallet holder-binding material
- optional passkey holder-binding material
- replay protection fields
- optional client metadata

## Envelope Structure

```json
{
  "version": "mintra.presentation/v1",
  "challenge": {
    "version": "mintra.challenge/v1",
    "challengeId": "uuid",
    "nonce": "hex",
    "verifier": "https://verifier.example",
    "audience": "https://app.example",
    "proofProductId": "proof_of_age_18",
    "issuedAt": "2026-04-21T10:00:00.000Z",
    "expiresAt": "2026-04-21T10:05:00.000Z"
  },
  "proof": {
    "format": "mina-attestations/auro",
    "presentationJson": "...",
    "presentationRequestJson": "..."
  },
  "holderBinding": {
    "method": "mina:signMessage",
    "publicKey": "B62...",
    "message": "Mintra proof presentation\n...",
    "signature": {
      "field": "...",
      "scalar": "..."
    },
    "signedAt": "2026-04-21T10:00:02.000Z"
  },
  "passkeyBinding": {
    "bindingId": "passkey-binding-id",
    "credentialId": "credential-id",
    "challenge": "webauthn-challenge",
    "signedPayload": {
      "challengeId": "uuid",
      "nonce": "hex",
      "audience": "https://app.example",
      "proofSha256": "sha256hex",
      "walletAddress": "B62...",
      "subjectId": "B62..."
    }
  }
}
```

## Verification Stages

1. Verify the challenge was issued by this verifier.
2. Verify the challenge has not expired.
3. Verify the challenge has not already been used.
4. Verify the Mina proof against the exact request JSON.
5. Verify the proof owner matches the expected wallet if required.
6. Verify the audience.
7. Verify the freshness policy.
8. Verify the wallet holder-binding signature.
9. If passkeys are required, verify the WebAuthn assertion against the stored passkey binding.

## Passkey Extension

Passkeys are additive. Mintra does not replace the wallet signature. It can require both:

- wallet signature proves control of the Mina wallet
- passkey assertion proves control of a registered device-bound credential

The verifier issues passkey assertion options only after it knows the exact `presentationJson`, because the passkey-signed payload includes `proofSha256`.
