# Replay Protection And Audience Binding

## Replay Protection

Each presentation request now carries:

- `challengeId`
- `nonce`
- `expiresAt`
- `singleUse: true`

The verifier stores the issued challenge and marks it consumed on verification attempt.

In production, that challenge state should live in Redis so replay protection survives:

- multiple verifier replicas
- rolling deploys
- process restarts

That blocks:

- replaying an older accepted proof
- reusing the same envelope multiple times
- fabricating a challenge that the verifier never issued

Challenge consumption is now modeled as an atomic store operation. Only one verifier instance should be able to consume the same challenge successfully.

## Audience Binding

The challenge also includes `audience`.

For the demo, that is the frontend origin allowed by the verifier.

The verifier checks that the submitted presentation was created for that audience. This reduces cross-site proof reuse and keeps a proof intended for one relying party from being silently reused at another.

## Holder Binding vs Audience Binding

They solve different problems:

- audience binding: which relying party the proof is for
- holder binding: whether the presenter controls the wallet that owns the credential

You want both.
