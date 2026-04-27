import { z } from "zod";
import {
  ClaimModelVersionSchema,
  CredentialTrustSchema,
  DerivedClaimsSchema,
  type DerivedClaims,
  SourceCommitmentsSchema,
} from "@mintra/credential-v2";

export const VerificationStatusSchema = z.enum([
  "not_started",
  "pending",
  "approved",
  "rejected",
  "needs_review",
  "error",
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const VerificationProviderIdSchema = z.enum(["didit", "idnorm"]);
export type VerificationProviderId = z.infer<typeof VerificationProviderIdSchema>;

export const NormalizedClaimsSchema = z.object({
  age_over_18: z.boolean().optional(),
  age_over_21: z.boolean().optional(),
  kyc_passed: z.boolean().optional(),
  country_code: z.string().length(2).toUpperCase().optional(),
  nationality: z.string().min(2).max(3).toUpperCase().optional(),
  document_expires_at: z.string().optional(),
});
export type NormalizedClaims = z.infer<typeof NormalizedClaimsSchema>;

export const VerificationRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  provider: VerificationProviderIdSchema,
  status: VerificationStatusSchema,
  claims: NormalizedClaimsSchema,
  claimModelVersion: ClaimModelVersionSchema.optional(),
  derivedClaims: DerivedClaimsSchema.optional(),
  sourceCommitments: SourceCommitmentsSchema.optional(),
  credentialTrust: CredentialTrustSchema.optional(),
  providerReference: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;

export function normalizedClaimsFromDerivedClaims(
  derivedClaims: DerivedClaims | undefined
): NormalizedClaims {
  if (!derivedClaims) return {};

  const claims: NormalizedClaims = {};
  const ageOver18 = derivedClaims["age_over_18"]?.value;
  const ageOver21 = derivedClaims["age_over_21"]?.value;
  const kycPassed = derivedClaims["kyc_passed"]?.value;
  const countryCode = derivedClaims["country_code"]?.value;

  if (typeof ageOver18 === "boolean") claims.age_over_18 = ageOver18;
  if (typeof ageOver21 === "boolean") claims.age_over_21 = ageOver21;
  if (typeof kycPassed === "boolean") claims.kyc_passed = kycPassed;
  if (typeof countryCode === "string" && countryCode.length === 2) {
    claims.country_code = countryCode.toUpperCase();
  }

  return claims;
}
