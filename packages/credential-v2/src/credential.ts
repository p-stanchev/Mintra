import { z } from "zod";
import {
  CredentialTrustSchema,
  DerivedClaimsSchema,
  SourceCommitmentsSchema,
} from "./claims";

export interface MinaCredentialData {
  ageOver18: 0 | 1;
  ageOver21: 0 | 1;
  kycPassed: 0 | 1;
  countryCode: number;
  nationalityCode: number;
  documentExpiresAt: number;
  isDemoCredential: 0 | 1;
  credentialMode: number;
  assuranceLevel: number;
  evidenceClass: number;
  issuedAt: number;
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
