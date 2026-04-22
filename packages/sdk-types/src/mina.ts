import { z } from "zod";
import type { NormalizedClaims } from "./verification";
import {
  ClaimModelVersionSchema,
  CredentialTrustSchema,
  DerivedClaimsSchema,
  SourceCommitmentsSchema,
} from "./claims";

export interface MinaCredentialData {
  ageOver18: 0 | 1;
  ageOver21: 0 | 1;
  kycPassed: 0 | 1;
  countryCode: number; // ISO 3166-1 numeric (0 = not provided)
  nationalityCode: number; // ISO 3166-1 numeric (0 = not provided)
  documentExpiresAt: number; // Unix timestamp seconds (0 = not provided)
  isDemoCredential: 0 | 1;
  credentialMode: number; // 1 = production, 2 = demo
  assuranceLevel: number; // 1 = low, 2 = medium, 3 = high
  evidenceClass: number; // 1 = locally-derived, 2 = provider-normalized, 3 = zk-proven
  issuedAt: number;    // Unix timestamp seconds
}

export const CREDENTIAL_MODE = {
  production: 1,
  demo: 2,
} as const;

export const ASSURANCE_LEVEL = {
  low: 1,
  medium: 2,
  high: 3,
} as const;

export const EVIDENCE_CLASS = {
  "locally-derived": 1,
  "provider-normalized": 2,
  "zk-proven": 3,
} as const;

export const CredentialV2Schema = z.object({
  version: z.literal("v2"),
  sourceCommitments: SourceCommitmentsSchema,
  derivedClaims: DerivedClaimsSchema,
  credentialTrust: CredentialTrustSchema.optional(),
});
export type CredentialV2 = z.infer<typeof CredentialV2Schema>;

export const CredentialMetadataSchema = z.discriminatedUnion("version", [
  z.object({
    version: z.literal("v1"),
    claims: z.record(z.unknown()).optional(),
    credentialTrust: CredentialTrustSchema.optional(),
  }),
  CredentialV2Schema,
]);
export type CredentialMetadata = z.infer<typeof CredentialMetadataSchema>;

export interface MinaIssuanceRequest {
  userId: string;
  claims: NormalizedClaims;
  ownerPublicKey: string; // Mina public key, Base58
  credentialMetadata?: CredentialMetadata;
}

export interface MinaIssuanceResult {
  credentialJson: string; // serialized mina-attestations credential
  issuerPublicKey: string;
  credentialMetadata?: CredentialMetadata;
}
