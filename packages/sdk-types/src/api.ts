import { z } from "zod";
import {
  NormalizedClaimsSchema,
  VerificationProviderIdSchema,
  VerificationRecordSchema,
} from "./verification";
import {
  ClaimAttestationsSchema,
  ClaimModelVersionSchema,
  CredentialTrustSchema,
  DerivedClaimsSchema,
  RegistryClaimProofsSchema,
  SourceCommitmentsSchema,
} from "@mintra/credential-v2";
import { CredentialMetadataSchema } from "@mintra/credential-v2";
import { ZkPolicyRequestSchema } from "./zk";

const MinaPublicKeySchema = z
  .string()
  .regex(/^B62[1-9A-HJ-NP-Za-km-z]{50,54}$/, "Invalid Mina public key");

export const MinaMessageSignatureSchema = z.object({
  field: z.string().min(1),
  scalar: z.string().min(1),
});
export type MinaMessageSignature = z.infer<typeof MinaMessageSignatureSchema>;

export const StartVerificationRequestSchema = z.object({
  userId: MinaPublicKeySchema,
  providerId: VerificationProviderIdSchema.optional(),
  redirectUrl: z.string().url().optional(),
});
export type StartVerificationRequest = z.infer<typeof StartVerificationRequestSchema>;

export const StartVerificationResponseSchema = z.object({
  sessionId: z.string(),
  verificationUrl: z.string().url(),
  provider: VerificationProviderIdSchema,
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

const IssueMinaCredentialResponseBaseSchema = z.object({
  credentialJson: z.string(),
  issuerPublicKey: z.string(),
  credentialMetadata: CredentialMetadataSchema.optional(),
});

export const GetZkProofInputResponseSchema = z.object({
  userId: MinaPublicKeySchema,
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  kycPassed: z.boolean().optional(),
  countryCode: z.string().regex(/^[A-Za-z]{2}$/).optional(),
  countryCodeNumeric: z.number().int().positive().optional(),
  credentialMetadata: CredentialMetadataSchema,
  zkSalts: z.object({
    dob: z.string().optional(),
    kyc: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
});
export type GetZkProofInputResponse = z.infer<typeof GetZkProofInputResponseSchema>;

export const GetZkAgeProofInputResponseSchema = GetZkProofInputResponseSchema;
export type GetZkAgeProofInputResponse = GetZkProofInputResponse;

export const ZkProofMaterialBundlePayloadSchema = z.object({
  version: z.literal("mintra.zk-proof-material/v2"),
  walletAddress: MinaPublicKeySchema,
  issuerPublicKey: MinaPublicKeySchema,
  issuedAt: z.string().datetime(),
  proofMaterial: GetZkProofInputResponseSchema,
  registryAttestations: ClaimAttestationsSchema.optional(),
});
export type ZkProofMaterialBundlePayload = z.infer<typeof ZkProofMaterialBundlePayloadSchema>;

export const SignedZkProofMaterialBundleSchema =
  ZkProofMaterialBundlePayloadSchema.extend({
    issuerSignature: MinaMessageSignatureSchema,
  });
export type SignedZkProofMaterialBundle = z.infer<typeof SignedZkProofMaterialBundleSchema>;

export const IssueMinaCredentialResponseSchema =
  IssueMinaCredentialResponseBaseSchema.extend({
    zkProofMaterial: GetZkProofInputResponseSchema.optional(),
    zkProofMaterialBundle: SignedZkProofMaterialBundleSchema.optional(),
    registryAttestations: ClaimAttestationsSchema.optional(),
  });
export type IssueMinaCredentialResponse = z.infer<typeof IssueMinaCredentialResponseSchema>;

export const CreateZkProofRequestSchema = z.object({
  userId: MinaPublicKeySchema,
  request: ZkPolicyRequestSchema,
  proofMaterialBundle: SignedZkProofMaterialBundleSchema.optional(),
});
export type CreateZkProofRequest = z.infer<typeof CreateZkProofRequestSchema>;

export const CreateZkProofResponseSchema = z.object({
  proof: z.unknown(),
  proofMaterialBundle: SignedZkProofMaterialBundleSchema.optional(),
});
export type CreateZkProofResponse = z.infer<typeof CreateZkProofResponseSchema>;

export const VerifyPresentationWithRegistryRequestSchema = z.object({
  presentationEnvelope: z.unknown(),
  registryAddress: z.string().min(1),
  minaGraphqlUrl: z.string().url(),
  claimProofs: RegistryClaimProofsSchema,
  expectedOwnerPublicKey: MinaPublicKeySchema.optional(),
});
export type VerifyPresentationWithRegistryRequest = z.infer<typeof VerifyPresentationWithRegistryRequestSchema>;

export const VerifyPresentationWithRegistryResponseSchema = z.object({
  ok: z.boolean(),
  registryVerified: z.boolean(),
  ownerPublicKey: MinaPublicKeySchema.optional(),
  verifiedAt: z.string().datetime(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
      detail: z.string().optional(),
    })
    .optional(),
});
export type VerifyPresentationWithRegistryResponse = z.infer<typeof VerifyPresentationWithRegistryResponseSchema>;

export const VerifyZkProofMaterialBundleRequestSchema = z.object({
  bundle: SignedZkProofMaterialBundleSchema,
});
export type VerifyZkProofMaterialBundleRequest = z.infer<typeof VerifyZkProofMaterialBundleRequestSchema>;

export const VerifyZkProofMaterialBundleResponseSchema = z.object({
  ok: z.literal(true),
  walletAddress: MinaPublicKeySchema,
  issuerPublicKey: MinaPublicKeySchema,
});
export type VerifyZkProofMaterialBundleResponse = z.infer<typeof VerifyZkProofMaterialBundleResponseSchema>;

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

export function canonicalizeZkProofMaterialBundlePayload(
  input: ZkProofMaterialBundlePayload
): string {
  return stableJsonStringify(ZkProofMaterialBundlePayloadSchema.parse(input));
}

function stableJsonStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot canonicalize non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`)
      .join(",")}}`;
  }
  throw new Error(`Unsupported value in canonical JSON: ${typeof value}`);
}
