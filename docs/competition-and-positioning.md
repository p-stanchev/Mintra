# Mintra — Competition and Positioning

## The Mina Identity Landscape

### mina-attestations (zksecurity)

[mina-attestations](https://github.com/zksecurity/mina-attestations) is the foundational credential layer for Mina. It provides:

- native credentials signed by a Mina key
- imported credentials wrapped in zk proofs
- selective disclosure primitives such as `PresentationSpec` and `PresentationRequest`
- wallet-facing credential flows that Mintra plugs into

**Mintra builds on top of mina-attestations, not against it.**

mina-attestations solves the cryptographic credential layer. It does not solve:

- KYC provider integration
- webhook processing and verification
- claim normalization into product-facing fields
- verifier service flows for web apps and relying parties

### idMask

idMask focuses on zk proofs of existing identity documents such as passport-chip data. Its model is more user-held and device-dependent.

**Mintra differs from idMask in product shape:**

- Mintra uses provider-backed server-side verification instead of NFC-first document proving
- Mintra targets the developer integration problem: "how do I add KYC and proof reuse to my Mina app?"
- idMask assumes a specific device and document capability path
- Mintra works with the provider and document coverage Didit supports

These approaches are complementary rather than mutually exclusive.

## Why Mintra Is Different

### The missing product layer

The Mina ecosystem has the cryptographic primitives, but it still needs an integration layer:

```text
What exists:    mina-attestations credential and proof primitives
What Mintra adds:
  provider integration
  claim normalization
  verifier product surface
  reusable credential and proof flows
What apps need:
  simple verifier-ready integration
```

Every Mina app team that wants "user must be KYC'd" otherwise has to:

1. choose a provider
2. integrate provider APIs
3. verify webhooks securely
4. normalize claim outputs
5. connect the result to Mina credential and proof flows

Mintra collapses that into a reusable system.

### Provider economics

| Provider | Free tier | Minimum contract | API-first |
|---|---|---|---|
| **Didit** | 500 checks/month | None | Yes |
| Sumsub | No | Yes | Yes |
| Persona | No | Yes | Yes |
| Veriff | No | Yes | Yes |
| Onfido | No | Yes | Yes |

Didit remains a strong fit for Mintra's current product stage because it is unusually accessible for developer-first integration work.

## Honest Positioning

Mintra is **not**:

- an identity issuer by itself
- a replacement for mina-attestations
- a fully on-chain identity protocol
- full in-circuit selective disclosure today

Mintra **is**:

- reusable verification infrastructure for Mina
- a provider bridge between real-world KYC and Mina credentials
- an off-chain verifier layer for fresh, verifier-bound proofs
- a commitment-backed foundation for stronger Mina-native privacy flows later
- an optional on-chain trust-anchor layer through `MintraRegistry`
