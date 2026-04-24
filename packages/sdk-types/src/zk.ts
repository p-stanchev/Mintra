import { z } from "zod";

export const ZkProofTypeSchema = z.enum([
  "mintra.zk.age-threshold/v1",
  "mintra.zk.kyc-passed/v1",
  "mintra.zk.country-membership/v1",
]);
export type ZkProofType = z.infer<typeof ZkProofTypeSchema>;

export const ZkPolicyChallengeSchema = z.object({
  challengeId: z.string().uuid(),
  nonce: z.string().min(16),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type ZkPolicyChallenge = z.infer<typeof ZkPolicyChallengeSchema>;

export const ZkAgeThresholdRequirementsSchema = z.object({
  ageGte: z.union([z.literal(18), z.literal(21)]),
});
export type ZkAgeThresholdRequirements = z.infer<typeof ZkAgeThresholdRequirementsSchema>;

export const ZkAgeThresholdPublicInputsSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commitmentKey: z.literal("dob_poseidon_commitment"),
});
export type ZkAgeThresholdPublicInputs = z.infer<typeof ZkAgeThresholdPublicInputsSchema>;

export const ZkAgeThresholdPolicyRequestSchema = z.object({
  version: z.literal("mintra.zk-policy/v1"),
  proofType: z.literal("mintra.zk.age-threshold/v1"),
  verifier: z.string().min(1),
  audience: z.string().min(1),
  challenge: ZkPolicyChallengeSchema,
  requirements: ZkAgeThresholdRequirementsSchema,
  publicInputs: ZkAgeThresholdPublicInputsSchema,
  metadata: z
    .object({
      proofProductId: z.literal("proof_of_age_18").optional(),
      credentialModel: z.literal("mintra.credential-v2").optional(),
    })
    .optional(),
});
export type ZkAgeThresholdPolicyRequest = z.infer<typeof ZkAgeThresholdPolicyRequestSchema>;

export const ZkKycPassedRequirementsSchema = z.object({
  kycPassed: z.literal(true),
});
export type ZkKycPassedRequirements = z.infer<typeof ZkKycPassedRequirementsSchema>;

export const ZkKycPassedPublicInputsSchema = z.object({
  commitmentKey: z.literal("kyc_passed_poseidon_commitment"),
});
export type ZkKycPassedPublicInputs = z.infer<typeof ZkKycPassedPublicInputsSchema>;

export const ZkKycPassedPolicyRequestSchema = z.object({
  version: z.literal("mintra.zk-policy/v1"),
  proofType: z.literal("mintra.zk.kyc-passed/v1"),
  verifier: z.string().min(1),
  audience: z.string().min(1),
  challenge: ZkPolicyChallengeSchema,
  requirements: ZkKycPassedRequirementsSchema,
  publicInputs: ZkKycPassedPublicInputsSchema,
  metadata: z
    .object({
      proofProductId: z.literal("proof_of_kyc_passed").optional(),
      credentialModel: z.literal("mintra.credential-v2").optional(),
    })
    .optional(),
});
export type ZkKycPassedPolicyRequest = z.infer<typeof ZkKycPassedPolicyRequestSchema>;

export const ZkCountryMembershipRequirementsSchema = z.object({
  countryAllowlist: z.array(z.string().min(2)).max(8).default([]),
  countryBlocklist: z.array(z.string().min(2)).max(8).default([]),
});
export type ZkCountryMembershipRequirements = z.infer<typeof ZkCountryMembershipRequirementsSchema>;

export const ZkCountryMembershipPublicInputsSchema = z.object({
  commitmentKey: z.literal("country_code_poseidon_commitment"),
  allowlistNumeric: z.array(z.number().int().positive()).max(8).default([]),
  blocklistNumeric: z.array(z.number().int().positive()).max(8).default([]),
});
export type ZkCountryMembershipPublicInputs = z.infer<typeof ZkCountryMembershipPublicInputsSchema>;

export const ZkCountryMembershipPolicyRequestSchema = z.object({
  version: z.literal("mintra.zk-policy/v1"),
  proofType: z.literal("mintra.zk.country-membership/v1"),
  verifier: z.string().min(1),
  audience: z.string().min(1),
  challenge: ZkPolicyChallengeSchema,
  requirements: ZkCountryMembershipRequirementsSchema,
  publicInputs: ZkCountryMembershipPublicInputsSchema,
  metadata: z
    .object({
      proofProductId: z.literal("proof_of_country_code").optional(),
      credentialModel: z.literal("mintra.credential-v2").optional(),
    })
    .optional(),
});
export type ZkCountryMembershipPolicyRequest = z.infer<typeof ZkCountryMembershipPolicyRequestSchema>;

export const ZkPolicyRequestSchema = z.discriminatedUnion("proofType", [
  ZkAgeThresholdPolicyRequestSchema,
  ZkKycPassedPolicyRequestSchema,
  ZkCountryMembershipPolicyRequestSchema,
]);
export type ZkPolicyRequest = z.infer<typeof ZkPolicyRequestSchema>;

export const ZkAgeClaimPublicInputSchema = z.object({
  dobCommitment: z.string().min(1),
  minAge: z.union([z.literal(18), z.literal(21)]),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ZkAgeClaimPublicInput = z.infer<typeof ZkAgeClaimPublicInputSchema>;

export const ZkKycClaimPublicInputSchema = z.object({
  kycCommitment: z.string().min(1),
});
export type ZkKycClaimPublicInput = z.infer<typeof ZkKycClaimPublicInputSchema>;

export const ZkCountryClaimPublicInputSchema = z.object({
  countryCommitment: z.string().min(1),
  allowlistNumeric: z.array(z.number().int().positive()).max(8),
  blocklistNumeric: z.array(z.number().int().positive()).max(8),
});
export type ZkCountryClaimPublicInput = z.infer<typeof ZkCountryClaimPublicInputSchema>;

export const ZkVerificationErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  detail: z.string().optional(),
});
export type ZkVerificationError = z.infer<typeof ZkVerificationErrorSchema>;

export const ZkVerificationResultSchema = z.object({
  ok: z.boolean(),
  proofType: ZkProofTypeSchema,
  audience: z.string().min(1),
  challengeId: z.string().uuid(),
  publicInput: z
    .union([
      ZkAgeClaimPublicInputSchema,
      ZkKycClaimPublicInputSchema,
      ZkCountryClaimPublicInputSchema,
    ])
    .optional(),
  error: ZkVerificationErrorSchema.optional(),
  verifiedAt: z.string().datetime(),
});
export type ZkVerificationResult = z.infer<typeof ZkVerificationResultSchema>;
