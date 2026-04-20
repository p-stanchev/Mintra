import { z } from "zod";
import { NormalizedClaimsSchema, VerificationRecordSchema } from "./verification";

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
  verifiedAt: z.string().datetime().nullable(),
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
});
export type IssueMinaCredentialResponse = z.infer<typeof IssueMinaCredentialResponseSchema>;

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
