import { z } from "zod";

export const ClaimModelVersionSchema = z.enum(["v1", "v2"]);
export type ClaimModelVersion = z.infer<typeof ClaimModelVersionSchema>;

export const CommitmentHashAlgorithmSchema = z.enum(["sha256"]);
export type CommitmentHashAlgorithm = z.infer<typeof CommitmentHashAlgorithmSchema>;

export const AssuranceLevelSchema = z.enum(["low", "medium", "high"]);
export type AssuranceLevel = z.infer<typeof AssuranceLevelSchema>;

export const EvidenceClassSchema = z.enum([
  "provider-normalized",
  "locally-derived",
  "zk-proven",
]);
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;

export const IssuerEnvironmentSchema = z.enum(["production", "demo"]);
export type IssuerEnvironment = z.infer<typeof IssuerEnvironmentSchema>;

export const SourceCommitmentSchema = z.object({
  key: z.string().min(1),
  algorithm: CommitmentHashAlgorithmSchema,
  encoding: z.literal("mintra.commitment/v1"),
  value: z.string().regex(/^[a-f0-9]{64}$/i, "Invalid commitment digest"),
});
export type SourceCommitment = z.infer<typeof SourceCommitmentSchema>;

export const SourceCommitmentsSchema = z.record(SourceCommitmentSchema);
export type SourceCommitments = z.infer<typeof SourceCommitmentsSchema>;

export const DerivedClaimValueSchema = z.union([z.boolean(), z.string().min(1), z.number().int()]);
export type DerivedClaimValue = z.infer<typeof DerivedClaimValueSchema>;

export const DerivedClaimMetaSchema = z.object({
  derivedFrom: z.array(z.string().min(1)).min(1),
  derivationMethod: z.string().min(1),
  derivationVersion: z.string().min(1),
  assuranceLevel: AssuranceLevelSchema,
  evidenceClass: EvidenceClassSchema,
});
export type DerivedClaimMeta = z.infer<typeof DerivedClaimMetaSchema>;

export const DerivedClaimSchema = z.object({
  key: z.string().min(1),
  value: DerivedClaimValueSchema,
  derivedFrom: z.array(z.string().min(1)).min(1),
  derivationMethod: z.string().min(1).default("unspecified"),
  derivationVersion: z.string().min(1).default("v1"),
  assuranceLevel: AssuranceLevelSchema.default("medium"),
  evidenceClass: EvidenceClassSchema.default("locally-derived"),
  relation: z.string().min(1).optional(),
});
export type DerivedClaim = z.infer<typeof DerivedClaimSchema>;

export const DerivedClaimsSchema = z.record(DerivedClaimSchema);
export type DerivedClaims = z.infer<typeof DerivedClaimsSchema>;

export const CredentialTrustSchema = z.object({
  issuerEnvironment: IssuerEnvironmentSchema,
  issuerId: z.string().min(1),
  issuerDisplayName: z.string().min(1),
  assuranceLevel: AssuranceLevelSchema,
  evidenceClass: EvidenceClassSchema,
  demoCredential: z.boolean(),
});
export type CredentialTrust = z.infer<typeof CredentialTrustSchema>;

export interface CommitmentHasher {
  algorithm: CommitmentHashAlgorithm;
  digestHex(input: string): Promise<string>;
}

export const sha256CommitmentHasher: CommitmentHasher = {
  algorithm: "sha256",
  async digestHex(input: string) {
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  },
};

export function encodeCommitmentInput(params: {
  key: string;
  type: "string" | "date";
  value: string;
}): string {
  return [
    "mintra.commitment/v1",
    `key:${params.key}`,
    `type:${params.type}`,
    `value:${params.value}`,
  ].join("\n");
}

export function normalizeCommitmentString(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeCommitmentDate(value: string): string {
  return value.trim();
}

export async function commitString(
  key: string,
  value: string,
  hasher: CommitmentHasher = sha256CommitmentHasher
): Promise<SourceCommitment> {
  const normalizedValue = normalizeCommitmentString(value);
  const encoded = encodeCommitmentInput({
    key,
    type: "string",
    value: normalizedValue,
  });
  return {
    key,
    algorithm: hasher.algorithm,
    encoding: "mintra.commitment/v1",
    value: await hasher.digestHex(encoded),
  };
}

export async function commitDOB(
  dateOfBirth: string,
  hasher: CommitmentHasher = sha256CommitmentHasher
): Promise<SourceCommitment> {
  const normalizedValue = normalizeCommitmentDate(dateOfBirth);
  const encoded = encodeCommitmentInput({
    key: "dob_commitment",
    type: "date",
    value: normalizedValue,
  });
  return {
    key: "dob_commitment",
    algorithm: hasher.algorithm,
    encoding: "mintra.commitment/v1",
    value: await hasher.digestHex(encoded),
  };
}

export function createDerivedClaim(
  key: string,
  value: DerivedClaimValue,
  derivedFrom: string[],
  relation: string,
  meta?: Partial<Omit<DerivedClaimMeta, "derivedFrom">>
): DerivedClaim {
  return DerivedClaimSchema.parse({
    key,
    value,
    derivedFrom,
    derivationMethod: meta?.derivationMethod ?? relation,
    derivationVersion: meta?.derivationVersion ?? "v1",
    assuranceLevel: meta?.assuranceLevel ?? "medium",
    evidenceClass: meta?.evidenceClass ?? "locally-derived",
    relation,
  });
}
