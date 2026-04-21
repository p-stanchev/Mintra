import { z } from "zod";

export const MinaPublicKeySchema = z
  .string()
  .regex(/^B62[1-9A-HJ-NP-Za-km-z]{50,54}$/, "Invalid Mina public key");

export const VerifierPolicySchema = z.object({
  minAge: z.union([z.literal(18), z.literal(21)]).nullable(),
  requireKycPassed: z.boolean(),
  countryAllowlist: z.array(z.string().min(2)).max(64),
  countryBlocklist: z.array(z.string().min(2)).max(64),
  maxCredentialAgeDays: z.number().int().positive().max(3650).nullable(),
});
export type VerifierPolicy = z.infer<typeof VerifierPolicySchema>;

export const ProofProductIdSchema = z.enum([
  "proof_of_age_18",
  "proof_of_kyc_passed",
  "proof_of_country_code",
]);
export type ProofProductId = z.infer<typeof ProofProductIdSchema>;

export const ProofProductSchema = z.object({
  id: ProofProductIdSchema,
  displayName: z.string().min(1),
  description: z.string().min(1),
  requestedClaims: z.array(z.string().min(1)).min(1),
  verificationRequirements: z.array(z.string().min(1)).min(1),
  outputFields: z.array(z.string().min(1)).min(1),
});
export type ProofProduct = z.infer<typeof ProofProductSchema>;

export const ReplayProtectionSchema = z.object({
  challengeId: z.string().uuid(),
  nonce: z.string().min(16),
  singleUse: z.literal(true),
  expiresAt: z.string().datetime(),
});
export type ReplayProtection = z.infer<typeof ReplayProtectionSchema>;

export const HolderBindingMethodSchema = z.enum(["wallet", "passkey"]);
export type HolderBindingMethod = z.infer<typeof HolderBindingMethodSchema>;

export const HolderBindingContextSchema = z.object({
  walletAddress: MinaPublicKeySchema.nullable(),
  subjectId: z.string().min(1),
  requiredMethods: z.array(HolderBindingMethodSchema).min(1),
});
export type HolderBindingContext = z.infer<typeof HolderBindingContextSchema>;

export const PasskeySignedPayloadSchema = z.object({
  challengeId: z.string().uuid(),
  nonce: z.string().min(16),
  audience: z.string().min(1),
  proofSha256: z.string().length(64),
  walletAddress: MinaPublicKeySchema,
  subjectId: z.string().min(1),
});
export type PasskeySignedPayload = z.infer<typeof PasskeySignedPayloadSchema>;

export const PasskeyAuthenticationRequestSchema = z.object({
  bindingId: z.string().min(1),
  rpId: z.string().min(1),
  origin: z.string().min(1),
  challenge: z.string().min(1),
  userVerification: z.literal("required"),
  timeoutMs: z.number().int().positive(),
  allowCredentialIds: z.array(z.string().min(1)).min(1),
  signedPayload: PasskeySignedPayloadSchema,
});
export type PasskeyAuthenticationRequest = z.infer<typeof PasskeyAuthenticationRequestSchema>;

export const PasskeyRegistrationChallengeSchema = z.object({
  registrationId: z.string().uuid(),
  walletAddress: MinaPublicKeySchema,
  subjectId: z.string().min(1),
  audience: z.string().min(1),
  origin: z.string().min(1),
  rpId: z.string().min(1),
  challenge: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type PasskeyRegistrationChallenge = z.infer<typeof PasskeyRegistrationChallengeSchema>;

export const PasskeyBindingSchema = z.object({
  bindingId: z.string().min(1),
  credentialId: z.string().min(1),
  publicKey: z.string().min(1),
  counter: z.number().int().nonnegative(),
  walletAddress: MinaPublicKeySchema,
  subjectId: z.string().min(1),
  deviceName: z.string().min(1).nullable(),
  transports: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PasskeyBinding = z.infer<typeof PasskeyBindingSchema>;

export const PasskeyAssertionSchema = z.object({
  bindingId: z.string().min(1),
  credentialId: z.string().min(1),
  challenge: z.string().min(1),
  signedPayload: PasskeySignedPayloadSchema,
  credential: z.object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal("public-key"),
    authenticatorAttachment: z.string().nullable().optional(),
    clientExtensionResults: z.record(z.unknown()).optional(),
    response: z.object({
      authenticatorData: z.string().min(1),
      clientDataJSON: z.string().min(1),
      signature: z.string().min(1),
      userHandle: z.string().nullable().optional(),
    }),
  }),
});
export type PasskeyAssertion = z.infer<typeof PasskeyAssertionSchema>;

export const PresentationChallengeSchema = z.object({
  version: z.literal("mintra.challenge/v1"),
  challengeId: z.string().uuid(),
  nonce: z.string().min(16),
  verifier: z.string().min(1),
  audience: z.string().min(1),
  action: z.string().min(1),
  proofProductId: ProofProductIdSchema,
  claimRequestRef: z.string().min(1),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  policy: VerifierPolicySchema,
  replayProtection: ReplayProtectionSchema,
  holderBindingContext: HolderBindingContextSchema,
});
export type PresentationChallenge = z.infer<typeof PresentationChallengeSchema>;

export const HolderBindingSchema = z.object({
  method: z.literal("mina:signMessage"),
  publicKey: MinaPublicKeySchema,
  message: z.string().min(1),
  signature: z.object({
    field: z.string().min(1),
    scalar: z.string().min(1),
  }),
  signedAt: z.string().datetime(),
});
export type HolderBinding = z.infer<typeof HolderBindingSchema>;

export const SerializedPresentationRequestSchema = z.record(z.unknown());
export type SerializedPresentationRequest = z.infer<typeof SerializedPresentationRequestSchema>;

export const PresentationRequestEnvelopeSchema = z.object({
  version: z.literal("mintra.presentation-request/v1"),
  proofProduct: ProofProductSchema,
  challenge: PresentationChallengeSchema,
  presentationRequest: SerializedPresentationRequestSchema,
  presentationRequestJson: z.string().min(1),
  holderBindingFormat: z.literal("mina:signMessage"),
  passkeyAuthentication: PasskeyAuthenticationRequestSchema.optional(),
});
export type PresentationRequestEnvelope = z.infer<typeof PresentationRequestEnvelopeSchema>;

export const PresentationProofSchema = z.object({
  format: z.literal("mina-attestations/auro"),
  presentationJson: z.string().min(1),
  presentationRequestJson: z.string().min(1),
});
export type PresentationProof = z.infer<typeof PresentationProofSchema>;

export const PresentationEnvelopeSchema = z.object({
  version: z.literal("mintra.presentation/v1"),
  challenge: PresentationChallengeSchema,
  proof: PresentationProofSchema,
  holderBinding: HolderBindingSchema,
  passkeyBinding: PasskeyAssertionSchema.optional(),
  metadata: z.object({
    walletProvider: z.string().min(1).optional(),
    submittedAt: z.string().datetime(),
    clientVersion: z.string().min(1).optional(),
  }),
});
export type PresentationEnvelope = z.infer<typeof PresentationEnvelopeSchema>;

export const PresentationVerificationOutputSchema = z.object({
  ageOver18: z.boolean(),
  ageOver21: z.boolean(),
  kycPassed: z.boolean(),
  countryCodeNumeric: z.number().int().nonnegative(),
  issuedAt: z.number().int().nonnegative(),
});
export type PresentationVerificationOutput = z.infer<typeof PresentationVerificationOutputSchema>;

export const HolderBindingVerificationSchema = z.object({
  verified: z.boolean(),
  reason: z.string().optional(),
  walletVerified: z.boolean().optional(),
  passkeyVerified: z.boolean().optional(),
  errorCode: z.string().optional(),
});
export type HolderBindingVerification = z.infer<typeof HolderBindingVerificationSchema>;

export const AudienceVerificationSchema = z.object({
  verified: z.boolean(),
  expected: z.string().min(1),
  actual: z.string().min(1),
});
export type AudienceVerification = z.infer<typeof AudienceVerificationSchema>;

export const FreshnessVerificationSchema = z.object({
  verified: z.boolean(),
  issuedAt: z.number().int().nonnegative(),
  credentialAgeSeconds: z.number().int().nonnegative(),
  maxAgeDays: z.number().int().positive().nullable(),
});
export type FreshnessVerification = z.infer<typeof FreshnessVerificationSchema>;

export const PresentationVerificationFailureSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  detail: z.string().optional(),
});
export type PresentationVerificationFailure = z.infer<typeof PresentationVerificationFailureSchema>;

export const PresentationVerificationResultSchema = z.object({
  ok: z.boolean(),
  challenge: z.object({
    challengeId: z.string().uuid(),
    proofProductId: ProofProductIdSchema,
    audience: z.string().min(1),
  }),
  ownerPublicKey: MinaPublicKeySchema.optional(),
  output: PresentationVerificationOutputSchema.optional(),
  holderBinding: HolderBindingVerificationSchema,
  audience: AudienceVerificationSchema,
  freshness: FreshnessVerificationSchema.optional(),
  error: PresentationVerificationFailureSchema.optional(),
  verifiedAt: z.string().datetime(),
});
export type PresentationVerificationResult = z.infer<typeof PresentationVerificationResultSchema>;
