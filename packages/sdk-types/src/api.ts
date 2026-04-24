import { z } from "zod";
import { NormalizedClaimsSchema, VerificationRecordSchema } from "./verification";
import {
  ClaimModelVersionSchema,
  CredentialTrustSchema,
  DerivedClaimsSchema,
  SourceCommitmentsSchema,
} from "@mintra/credential-v2";
import { CredentialMetadataSchema } from "@mintra/credential-v2";

const MinaPublicKeySchema = z
  .string()
  .regex(/^B62[1-9A-HJ-NP-Za-km-z]{50,54}$/, "Invalid Mina public key");

export const StartVerificationRequestSchema = z.object({
  userId: MinaPublicKeySchema,
  redirectUrl: z.string().url().optional(),
});
export type StartVerificationRequest = z.infer<typeof StartVerificationRequestSchema>;

export const StartVerificationResponseSchema = z.object({
  sessionId: z.string(),
  verificationUrl: z.string().url(),
  status: z.literal("not_started"),
});
export type StartVerificationResponse = z.infer<typeof StartVerificationResponseSchema>;

export const GetStatusResponseSchema = VerificationRecordSchema;
export type GetStatusResponse = z.infer<typeof GetStatusResponseSchema>;

export const GetClaimsResponseSchema = z.object({
  userId: z.string(),
  claims: NormalizedClaimsSchema,
  claimModelVersion: ClaimModelVersionSchema.optional(),
  derivedClaims: DerivedClaimsSchema.optional(),
  sourceCommitments: SourceCommitmentsSchema.optional(),
  credentialTrust: CredentialTrustSchema.optional(),
  isDemoCredential: z.boolean().optional(),
  documentExpiresAt: z.string().datetime().nullable().optional(),
  verifiedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
  freshnessStatus: z.enum(["verified", "expiring_soon", "expired", "unverified"]),
});
export type GetClaimsResponse = z.infer<typeof GetClaimsResponseSchema>;

export const IssueMinaCredentialRequestSchema = z.object({
  userId: MinaPublicKeySchema,
  ownerPublicKey: MinaPublicKeySchema,
});
export type IssueMinaCredentialRequest = z.infer<typeof IssueMinaCredentialRequestSchema>;

export const IssueMinaCredentialResponseSchema = z.object({
  credentialJson: z.string(),
  issuerPublicKey: z.string(),
  credentialMetadata: CredentialMetadataSchema.optional(),
});
export type IssueMinaCredentialResponse = z.infer<typeof IssueMinaCredentialResponseSchema>;

export const IssueDemoClaimsRequestSchema = z.object({
  userId: MinaPublicKeySchema,
  ageOver18: z.boolean(),
  ageOver21: z.boolean(),
  kycPassed: z.boolean(),
  countryCode: z.string().regex(/^[A-Za-z]{2}$/, "Expected ISO alpha-2 country code").optional(),
  nationality: z.string().regex(/^[A-Za-z]{2,3}$/, "Expected ISO alpha-2 or alpha-3 nationality code").optional(),
  documentExpiresAt: z.string().date().optional(),
});
export type IssueDemoClaimsRequest = z.infer<typeof IssueDemoClaimsRequestSchema>;

export const IssueDemoClaimsResponseSchema = GetClaimsResponseSchema;
export type IssueDemoClaimsResponse = z.infer<typeof IssueDemoClaimsResponseSchema>;

export const CreateWalletAuthChallengeRequestSchema = z.object({
  walletAddress: MinaPublicKeySchema,
});
export type CreateWalletAuthChallengeRequest = z.infer<typeof CreateWalletAuthChallengeRequestSchema>;

export const CreateWalletAuthChallengeResponseSchema = z.object({
  challengeId: z.string().uuid(),
  message: z.string().min(1),
  expiresAt: z.string().datetime(),
});
export type CreateWalletAuthChallengeResponse = z.infer<typeof CreateWalletAuthChallengeResponseSchema>;

export const VerifyWalletAuthRequestSchema = z.object({
  challengeId: z.string().uuid(),
  publicKey: MinaPublicKeySchema,
  data: z.string().min(1),
  signature: z.object({
    field: z.string().min(1),
    scalar: z.string().min(1),
  }),
});
export type VerifyWalletAuthRequest = z.infer<typeof VerifyWalletAuthRequestSchema>;

export const VerifyWalletAuthResponseSchema = z.object({
  token: z.string().min(1),
  walletAddress: MinaPublicKeySchema,
  expiresAt: z.string().datetime(),
});
export type VerifyWalletAuthResponse = z.infer<typeof VerifyWalletAuthResponseSchema>;
