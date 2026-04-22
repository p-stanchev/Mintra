# How To Consume Proofs

A relying party should consume Mintra proofs on its own backend.

The key product model is:

**Verify once with Mintra. Reuse the credential everywhere. Generate verifier-bound proofs for each app.**

That means:

- the wallet credential is portable across apps
- a single proof presentation is not meant to be forwarded and reused everywhere
- each relying party should request its own fresh proof

## Recommended Backend Flow

1. Choose a proof product.
2. Create a presentation request on the backend.
3. Send the request envelope to the frontend.
4. Ask the wallet to:
   - build the Mina presentation
   - sign the holder-binding message
5. Send the full presentation envelope back to the backend.
6. Verify it server-side.
7. Grant or deny access based on the normalized result object.

## Add KYC To Your App In 10 Lines

```ts
import { verifyPresentation } from "@mintra/verifier-core";

const result = await verifyPresentation({
  envelope: presentationEnvelope,
  verifierIdentity: "https://app.example.com",
  expectedAudience: "https://app.example.com",
  expectedOwnerPublicKey: walletAddress,
  holderBindingVerifier,
});

if (result.ok && result.output?.kycPassed) {
  // allow access
}
```

This is the real backend decision point:

- `result.ok` means the proof, audience, freshness, replay checks, and holder binding passed
- `result.output` gives you normalized fields like `ageOver18`, `kycPassed`, and `countryCodeNumeric`
- replace `https://app.example.com` with the real app or backend origin that is verifying the proof

## Gate A Feature Behind Age Verification In 5 Minutes

```ts
import { createPresentationRequest, verifyPresentation } from "@mintra/verifier-core";

const request = await createPresentationRequest({
  proofProductId: "proof_of_age_18",
  audience: "https://app.example.com",
  verifier: "https://verifier.example.com",
  walletAddress,
});

// send request to the frontend, collect presentationEnvelope back from the wallet

const result = await verifyPresentation({
  envelope: presentationEnvelope,
  verifierIdentity: "https://app.example.com",
  expectedAudience: "https://app.example.com",
  expectedOwnerPublicKey: walletAddress,
  holderBindingVerifier,
});

if (result.ok && result.output?.ageOver18) {
  // unlock feature
}
```

The same Mintra credential can be used again on another site, but that site should create its own request and collect its own fresh presentation.

## 5-Minute HTTP Integration

If you do not want to embed verifier-core directly, call the verifier service over HTTP:

```ts
const requestResponse = await fetch("https://verifier.example.com/api/presentation-request", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    proofProductId: "proof_of_age_18",
    expectedOwnerPublicKey: walletAddress,
    policy: {
      minAge: 18,
      requireKycPassed: true,
    },
  }),
});

const { requestEnvelope } = await requestResponse.json();

// frontend: ask the wallet to return presentationEnvelope

const verifyResponse = await fetch("https://verifier.example.com/api/verify-presentation", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    presentationEnvelope,
    expectedOwnerPublicKey: walletAddress,
  }),
});

const result = await verifyResponse.json();

if (result.ok && result.output?.ageOver18) {
  // allow access
}
```

## Proof Products

Current built-in proof products:

- `proof_of_age_18`
- `proof_of_kyc_passed`
- `proof_of_country_code`

Each product has:

- a display name
- a description
- requested claims
- default verification policy
- expected output fields

## Backend Examples

- [Fastify example](./fastify-presentation-route.md)
- [Next.js route example](./next-presentation-route.md)
