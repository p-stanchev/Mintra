import { z } from "zod";

export const VerificationStatusSchema = z.enum([
  "not_started",
  "pending",
  "approved",
  "rejected",
  "needs_review",
  "error",
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const NormalizedClaimsSchema = z.object({
  age_over_18: z.boolean().optional(),
  age_over_21: z.boolean().optional(),
  kyc_passed: z.boolean().optional(),
  country_code: z.string().length(2).toUpperCase().optional(),
});
export type NormalizedClaims = z.infer<typeof NormalizedClaimsSchema>;

export const VerificationRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  provider: z.literal("didit"),
  status: VerificationStatusSchema,
  claims: NormalizedClaimsSchema,
  providerReference: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;
