import { z } from "zod";
import { NormalizedClaimsSchema, VerificationRecordSchema } from "./verification";

export const StartVerificationRequestSchema = z.object({
  userId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_\-.@:]+$/, "userId contains invalid characters"),
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
  userId: z.string().min(1),
  ownerPublicKey: z.string().min(1),
});
export type IssueMinaCredentialRequest = z.infer<typeof IssueMinaCredentialRequestSchema>;

export const IssueMinaCredentialResponseSchema = z.object({
  credentialJson: z.string(),
  issuerPublicKey: z.string(),
});
export type IssueMinaCredentialResponse = z.infer<typeof IssueMinaCredentialResponseSchema>;
