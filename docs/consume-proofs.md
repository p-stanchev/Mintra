# How To Consume Proofs

A relying party should consume Mintra proofs on its own backend.

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

- [Fastify example](./examples/fastify-presentation-route.ts)
- [Next.js route example](./examples/next-presentation-route.ts)
