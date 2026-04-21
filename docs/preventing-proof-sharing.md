# Preventing Proof Sharing

Full anti-sharing is hard. Mintra implements a realistic server-verifiable layer that raises the bar materially.

## What Mintra Does Today

- verifier-issued challenge IDs
- verifier-issued nonces
- single-use challenge consumption
- audience binding
- short challenge expiry
- holder-binding wallet signature over the exact proof hash
- optional or required passkey assertion over the same challenge and proof hash
- verifier-side passkey binding storage keyed to the wallet / subject

## Why the Holder-Binding Step Matters

Without holder binding, anyone who obtains a raw presentation blob could try forwarding it.

With wallet holder binding, the verifier expects a valid wallet signature over:

- the verifier challenge
- the expected audience
- the proof hash
- the owner public key

That means a forwarded proof without a matching wallet signature fails.

When passkey binding is enabled, the verifier also expects a valid WebAuthn assertion for:

- `challengeId`
- `nonce`
- `audience`
- `proof_sha256`
- the wallet / subject binding

That raises the bar from "someone can forward a presentation bundle" to "someone would need both the wallet control and the registered device credential".

## Limits

This is not a complete anti-collusion solution. It does not protect against:

- malware on the holder device
- a compromised browser session
- live forwarding before the first verification attempt lands
- deliberate credential sharing with physical access to both wallet and registered passkey device

## Why Wallet-Only Is Not Enough

Wallet-only binding proves wallet control, but not necessarily device possession. If a wallet signs in a delegated or forwarded flow, a verifier may still want a second factor tied to the presenter device.

Passkeys improve that by:

- using browser-native WebAuthn primitives
- binding the verifier challenge to the exact proof hash
- giving the verifier a reusable, server-verifiable device credential record

Multiple device support and recovery flows are still future work.
