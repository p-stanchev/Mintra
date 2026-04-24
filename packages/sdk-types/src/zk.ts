import { z } from "zod";

export const ZkProofTypeSchema = z.enum(["mintra.zk.age-threshold/v1"]);
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
  commitmentKey: z.literal("dob_commitment"),
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

export const ZkPolicyRequestSchema = z.discriminatedUnion("proofType", [
  ZkAgeThresholdPolicyRequestSchema,
]);
export type ZkPolicyRequest = z.infer<typeof ZkPolicyRequestSchema>;

export const ZkAgeClaimPublicInputSchema = z.object({
  dobCommitment: z.string().min(1),
  minAge: z.union([z.literal(18), z.literal(21)]),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ZkAgeClaimPublicInput = z.infer<typeof ZkAgeClaimPublicInputSchema>;

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
  publicInput: ZkAgeClaimPublicInputSchema.optional(),
  error: ZkVerificationErrorSchema.optional(),
  verifiedAt: z.string().datetime(),
});
export type ZkVerificationResult = z.infer<typeof ZkVerificationResultSchema>;
