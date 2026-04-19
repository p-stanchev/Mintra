# Mintra — Competition and Positioning

## The Mina Identity Landscape

### mina-attestations (zksecurity)

[mina-attestations](https://github.com/zksecurity/mina-attestations) is the foundational ZK credential library for Mina. It provides:
- Native credentials (Schnorr-signed by a Mina key)
- Imported credentials (external credentials wrapped in ZK proofs)
- Selective disclosure via `PresentationSpec` and `PresentationRequest`
- Wallet-facing credential flows that Mintra can plug into

**Mintra builds on top of mina-attestations, not against it.**

mina-attestations solves the cryptographic layer. It does not solve:
- How to integrate a KYC provider
- How to handle webhooks securely
- How to normalize provider results into typed claims
- How to give developers a clean SDK

### idMask

idMask is another Mina identity project. It focuses on ZK proofs of existing credentials (e.g., passport chip reading, government IDs). Its approach requires hardware support (NFC-capable devices) and is oriented toward the user holding and presenting their own ID.

**Mintra's differentiation from idMask:**
- Mintra uses server-side KYC (provider-verified) rather than client-side ZK passport proofs
- Mintra targets the developer integration problem: "how do I add KYC to my app?"
- idMask requires the user to have an NFC-capable device and a supported passport
- Mintra works with any device/country/document type that Didit supports

These are complementary approaches. A user could prove to idMask they hold a valid passport, and prove to Mintra's verifier they passed KYC — both flow into mina-attestations credentials.

## Why Mintra is Different

### The missing product layer

The Mina ecosystem has the cryptographic infrastructure (mina-attestations) but lacks the **provider integration layer**:

```
What exists:         [mina-attestations ZK primitives]
What's missing:      [KYC provider → claim normalization → SDK]  ← Mintra
What apps need:      [simple API that gives them verified claims]
```

Every Mina app team that wants to add "user must be KYC'd" currently needs to:
1. Research and select a KYC provider
2. Build the API integration
3. Handle webhooks securely
4. Design a claim model
5. Figure out how to connect it to mina-attestations

Mintra makes this a 10-line SDK call.

### Provider economics

| Provider | Free tier | Minimum contract | API-first |
|---|---|---|---|
| **Didit** | 500 checks/month | None | Yes |
| Sumsub | No | Yes | Yes |
| Persona | No | Yes | Yes |
| Veriff | No | Yes | Yes |
| Onfido | No | Yes | Yes |

Didit's pricing is unusually developer-friendly for an MVP-stage product in a new ecosystem like Mina. 500 free checks/month allows a Mina app to reach initial user adoption before incurring KYC costs.

### Grant alignment

The Mina Builders Grants Program funds:
- Early exploration grants (proof-of-concept + architecture work)
- Builder grants (real-world projects with adoption potential)

Mintra fits both:
- It demonstrates a real product use case for mina-attestations
- It reduces the barrier to building compliant Mina apps
- It is open-source infrastructure that benefits the whole ecosystem

## Honest Positioning

Mintra is **not**:
- An identity issuer (Didit is)
- A replacement for mina-attestations
- A privacy-preserving KYC solution in v1 (v2 adds ZK proofs)
- Fully on-chain in v1 (claims are off-chain and credentials are API-issued/stored in-wallet)

Mintra **is**:
- A developer tool that makes it practical to add KYC to Mina apps
- A clean adapter between the messy real-world identity layer and Mina's cryptographic layer
- A reusable claim normalization system that works across providers
- The missing piece between "mina-attestations exists" and "my app has verified users"
