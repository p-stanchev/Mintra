// V2 SCAFFOLD — not in the v1 runtime path
//
// This file documents how a dApp would construct a PresentationRequest using
// the Mintra credential schema. The AgeOver18Spec below allows a user to prove
// age_over_18 = 1 without revealing countryCode or issuedAt.
//
// Prerequisites for v2:
//   1. Wallet presentation support (Auro storage is integrated; proof request flow is still pending)
//   2. mina-attestations PresentationSpec / PresentationRequest API (stable in 0.5.x)
//   3. On-chain verifier zkApp or HTTPS verifier endpoint
//
// ─── SCHEMA REFERENCE ────────────────────────────────────────────────────────
//
// MintraClaimSchema = {
//   ageOver18:   Field,   // 1 if age_over_18, else 0
//   kycPassed:   Field,   // 1 if kyc_passed, else 0
//   countryCode: Field,   // ISO 3166-1 numeric (0 = not provided)
//   issuedAt:    Field,   // Unix timestamp (seconds)
// }
//
// ─── V2 EXAMPLE (uncomment when ready) ───────────────────────────────────────
//
// import { PresentationSpec, PresentationRequest, Credential } from "mina-attestations";
// import { Field } from "o1js";
//
// const MintraClaimSchema = {
//   ageOver18:   Field,
//   kycPassed:   Field,
//   countryCode: Field,
//   issuedAt:    Field,
// };
//
// // Spec: assert ageOver18 == 1, output a single Bool — reveals nothing else
// export const AgeOver18Spec = PresentationSpec.create(
//   { mintraClaim: Credential.Simple(MintraClaimSchema) },
//   ({ mintraClaim }) => ({
//     assert: mintraClaim.data.ageOver18.equals(Field(1)),
//     outputClaim: { isAdult: mintraClaim.data.ageOver18 },
//   })
// );
//
// // Build a request that a verifier sends to the wallet
// export function buildAgeProofRequest(context: { action: string; serverNonce: string }) {
//   return PresentationRequest.httpsFromSpec(AgeOver18Spec, context, {
//     // Only accept credentials issued by Mintra's issuer key
//     issuer: "B62...mintra-issuer-key-here...",
//   });
// }
//
// // Verify a returned presentation on the server (no chain access needed for HTTPS mode)
// export async function verifyAgeProof(
//   request: ReturnType<typeof buildAgeProofRequest>,
//   presentationJson: string
// ) {
//   const presentation = JSON.parse(presentationJson);
//   const result = await Presentation.verify(request, presentation, {
//     verifierIdentity: "https://your-verifier.example.com",
//   });
//   return result; // { isAdult: Field(1) } if valid
// }
