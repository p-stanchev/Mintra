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
  issuedAt: number;    // Unix timestamp seconds
}

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
