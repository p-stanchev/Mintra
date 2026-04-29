import { z } from "zod";
import { DerivedClaimValueSchema } from "./claims";

const HEX_64_RE = /^[a-f0-9]{64}$/i;
const HEX_RE = /^[a-f0-9]+$/i;

export const HexDigestSchema = z.string().regex(HEX_64_RE, "Expected 64-char hex digest");
export type HexDigest = z.infer<typeof HexDigestSchema>;

export const ClaimAttestationSchema = z.object({
  version: z.literal("mintra.claim-attestation/v1"),
  claimType: z.string().min(1),
  value: DerivedClaimValueSchema,
  subjectHash: HexDigestSchema,
  issuerPublicKey: z.string().min(1),
  expiresAt: z.string().datetime(),
  salt: z.string().regex(HEX_RE, "Expected hex salt").min(16),
  commitment: HexDigestSchema,
});
export type ClaimAttestation = z.infer<typeof ClaimAttestationSchema>;

export const ClaimAttestationsSchema = z.record(ClaimAttestationSchema);
export type ClaimAttestations = z.infer<typeof ClaimAttestationsSchema>;

export const RegistryMerkleProofSchema = z.object({
  leafHash: HexDigestSchema,
  leafIndex: z.number().int().nonnegative(),
  siblings: z.array(HexDigestSchema),
  root: HexDigestSchema,
});
export type RegistryMerkleProof = z.infer<typeof RegistryMerkleProofSchema>;

export const RevocationStatusLeafSchema = z.object({
  version: z.literal("mintra.revocation-status/v1"),
  commitment: HexDigestSchema,
  revoked: z.boolean(),
});
export type RevocationStatusLeaf = z.infer<typeof RevocationStatusLeafSchema>;

export const RegistryClaimProofSchema = z.object({
  attestation: ClaimAttestationSchema,
  inclusionProof: RegistryMerkleProofSchema,
  revocationLeaf: RevocationStatusLeafSchema,
  revocationProof: RegistryMerkleProofSchema,
});
export type RegistryClaimProof = z.infer<typeof RegistryClaimProofSchema>;

export const RegistryClaimProofsSchema = z.record(RegistryClaimProofSchema);
export type RegistryClaimProofs = z.infer<typeof RegistryClaimProofsSchema>;

export async function hashSubjectToHex(subject: string): Promise<HexDigest> {
  return digestSha256Hex(
    ["mintra.subject/v1", `subject:${subject.trim()}`].join("\n")
  );
}

export async function createClaimAttestation(params: {
  claimType: string;
  value: string | number | boolean;
  subject?: string;
  subjectHash?: string;
  issuerPublicKey: string;
  expiresAt: string | Date;
  salt?: string;
}): Promise<ClaimAttestation> {
  const subjectHash =
    params.subjectHash?.trim().toLowerCase() ??
    (params.subject ? await hashSubjectToHex(params.subject) : null);
  if (!subjectHash) {
    throw new Error("Either subject or subjectHash is required");
  }
  const expiresAt =
    params.expiresAt instanceof Date ? params.expiresAt.toISOString() : new Date(params.expiresAt).toISOString();
  const salt = params.salt?.trim().toLowerCase() ?? randomHex(16);
  const commitment = await digestSha256Hex(
    encodeClaimAttestationInput({
      claimType: params.claimType,
      value: params.value,
      subjectHash,
      issuerPublicKey: params.issuerPublicKey,
      expiresAt,
      salt,
    })
  );

  return ClaimAttestationSchema.parse({
    version: "mintra.claim-attestation/v1",
    claimType: params.claimType,
    value: params.value,
    subjectHash,
    issuerPublicKey: params.issuerPublicKey,
    expiresAt,
    salt,
    commitment,
  });
}

export async function verifyClaimAttestation(attestation: ClaimAttestation): Promise<boolean> {
  const parsed = ClaimAttestationSchema.parse(attestation);
  const expected = await digestSha256Hex(
    encodeClaimAttestationInput({
      claimType: parsed.claimType,
      value: parsed.value,
      subjectHash: parsed.subjectHash,
      issuerPublicKey: parsed.issuerPublicKey,
      expiresAt: parsed.expiresAt,
      salt: parsed.salt,
    })
  );
  return expected === parsed.commitment.toLowerCase();
}

export async function hashCredentialLeaf(commitment: string): Promise<HexDigest> {
  return digestSha256Hex(
    ["mintra.registry.credential-leaf/v1", `commitment:${commitment.toLowerCase()}`].join("\n")
  );
}

export async function hashRevocationLeaf(input: RevocationStatusLeaf): Promise<HexDigest> {
  const parsed = RevocationStatusLeafSchema.parse(input);
  return digestSha256Hex(
    [
      "mintra.registry.revocation-leaf/v1",
      `commitment:${parsed.commitment.toLowerCase()}`,
      `revoked:${parsed.revoked ? "true" : "false"}`,
    ].join("\n")
  );
}

export async function buildMerkleTree(leafHashes: string[]): Promise<{ root: HexDigest; levels: string[][] }> {
  const normalizedLeaves = leafHashes.map((leaf) => HexDigestSchema.parse(leaf).toLowerCase());
  if (normalizedLeaves.length === 0) {
    return { root: zeroDigest(), levels: [[zeroDigest()]] };
  }

  const levels: string[][] = [normalizedLeaves];
  let current = normalizedLeaves;
  while (current.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index]!;
      const right = current[index + 1] ?? current[index]!;
      next.push(await hashMerkleBranch(left, right));
    }
    levels.push(next);
    current = next;
  }

  return {
    root: HexDigestSchema.parse(current[0]),
    levels,
  };
}

export async function createMerkleProof(leafHashes: string[], leafIndex: number): Promise<RegistryMerkleProof> {
  const { root, levels } = await buildMerkleTree(leafHashes);
  const leaves = levels[0] ?? [];
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error("Leaf index is out of bounds for Merkle proof generation");
  }

  const siblings: string[] = [];
  let index = leafIndex;
  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
    const level = levels[levelIndex]!;
    const siblingIndex = index ^ 1;
    siblings.push(level[siblingIndex] ?? level[index]!);
    index = Math.floor(index / 2);
  }

  return RegistryMerkleProofSchema.parse({
    leafHash: leaves[leafIndex],
    leafIndex,
    siblings,
    root,
  });
}

export async function verifyMerkleProof(proof: RegistryMerkleProof): Promise<boolean> {
  const parsed = RegistryMerkleProofSchema.parse(proof);
  let hash = parsed.leafHash.toLowerCase();
  let index = parsed.leafIndex;
  for (const sibling of parsed.siblings) {
    const normalizedSibling = sibling.toLowerCase();
    hash =
      index % 2 === 0
        ? await hashMerkleBranch(hash, normalizedSibling)
        : await hashMerkleBranch(normalizedSibling, hash);
    index = Math.floor(index / 2);
  }
  return hash === parsed.root.toLowerCase();
}

export async function createRegistryClaimProof(params: {
  attestation: ClaimAttestation;
  allCredentialCommitments: string[];
  revocationStatuses: RevocationStatusLeaf[];
}): Promise<RegistryClaimProof> {
  const attestation = ClaimAttestationSchema.parse(params.attestation);
  const credentialLeafHashes = await Promise.all(
    params.allCredentialCommitments.map((commitment) => hashCredentialLeaf(commitment))
  );
  const credentialLeafHash = await hashCredentialLeaf(attestation.commitment);
  const inclusionIndex = credentialLeafHashes.findIndex((value) => value === credentialLeafHash);
  if (inclusionIndex < 0) {
    throw new Error("Attestation commitment is not present in the credential commitment set");
  }

  const revocationLeaf = params.revocationStatuses.find((status) => status.commitment === attestation.commitment);
  if (!revocationLeaf) {
    throw new Error("Revocation status leaf for attestation commitment was not found");
  }
  const revocationLeafHashes = await Promise.all(
    params.revocationStatuses.map((status) => hashRevocationLeaf(status))
  );
  const revocationTargetHash = await hashRevocationLeaf(revocationLeaf);
  const revocationIndex = revocationLeafHashes.findIndex((value) => value === revocationTargetHash);
  if (revocationIndex < 0) {
    throw new Error("Revocation status leaf hash could not be found in the revocation set");
  }

  return RegistryClaimProofSchema.parse({
    attestation,
    inclusionProof: await createMerkleProof(credentialLeafHashes, inclusionIndex),
    revocationLeaf,
    revocationProof: await createMerkleProof(revocationLeafHashes, revocationIndex),
  });
}

export async function verifyRegistryClaimProof(proof: RegistryClaimProof): Promise<boolean> {
  const parsed = RegistryClaimProofSchema.parse(proof);
  const attestationValid = await verifyClaimAttestation(parsed.attestation);
  if (!attestationValid) return false;

  const expectedCredentialLeaf = await hashCredentialLeaf(parsed.attestation.commitment);
  if (expectedCredentialLeaf !== parsed.inclusionProof.leafHash.toLowerCase()) return false;
  const inclusionVerified = await verifyMerkleProof(parsed.inclusionProof);
  if (!inclusionVerified) return false;

  const expectedRevocationLeaf = await hashRevocationLeaf(parsed.revocationLeaf);
  if (expectedRevocationLeaf !== parsed.revocationProof.leafHash.toLowerCase()) return false;
  if (parsed.revocationLeaf.commitment !== parsed.attestation.commitment) return false;
  const revocationVerified = await verifyMerkleProof(parsed.revocationProof);
  if (!revocationVerified) return false;

  return parsed.revocationLeaf.revoked === false;
}

function encodeClaimAttestationInput(params: {
  claimType: string;
  value: string | number | boolean;
  subjectHash: string;
  issuerPublicKey: string;
  expiresAt: string;
  salt: string;
}): string {
  return [
    "mintra.claim-attestation/v1",
    `claimType:${params.claimType}`,
    `value:${formatClaimValue(params.value)}`,
    `subjectHash:${params.subjectHash.toLowerCase()}`,
    `issuerPublicKey:${params.issuerPublicKey}`,
    `expiresAt:${params.expiresAt}`,
    `salt:${params.salt.toLowerCase()}`,
  ].join("\n");
}

function formatClaimValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return value;
}

async function hashMerkleBranch(left: string, right: string): Promise<HexDigest> {
  return digestSha256Hex(
    ["mintra.registry.branch/v1", `left:${left.toLowerCase()}`, `right:${right.toLowerCase()}`].join("\n")
  );
}

async function digestSha256Hex(input: string): Promise<HexDigest> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return HexDigestSchema.parse(
    Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")
  );
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function zeroDigest(): HexDigest {
  return "0".repeat(64);
}
