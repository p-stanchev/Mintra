import { Field } from "o1js";
import {
  RevocationStatusLeafSchema,
  buildMerkleTree,
  hashCredentialLeaf,
  hashRevocationLeaf,
  type RevocationStatusLeaf,
} from "@mintra/credential-v2";

export interface RegistryAttestationState {
  credentialCommitments: string[];
  revocationStatuses: RevocationStatusLeaf[];
}

export async function computeRegistryRoots(state: RegistryAttestationState): Promise<{
  credentialRootHex: string;
  revocationRootHex: string;
  credentialRootField: Field;
  revocationRootField: Field;
}> {
  const credentialLeafHashes = await Promise.all(
    dedupeAndSort(state.credentialCommitments).map((commitment) => hashCredentialLeaf(commitment))
  );
  const revocationLeafHashes = await Promise.all(
    normalizeRevocationStatuses(state.revocationStatuses).map((leaf) => hashRevocationLeaf(leaf))
  );

  const credentialTree = await buildMerkleTree(credentialLeafHashes);
  const revocationTree = await buildMerkleTree(revocationLeafHashes);

  return {
    credentialRootHex: credentialTree.root,
    revocationRootHex: revocationTree.root,
    credentialRootField: hexDigestToField(credentialTree.root),
    revocationRootField: hexDigestToField(revocationTree.root),
  };
}

export function normalizeRegistryAttestationState(
  state: Partial<RegistryAttestationState> | null | undefined
): RegistryAttestationState {
  return {
    credentialCommitments: dedupeAndSort(state?.credentialCommitments ?? []),
    revocationStatuses: normalizeRevocationStatuses(state?.revocationStatuses ?? []),
  };
}

export function upsertCredentialCommitment(
  state: RegistryAttestationState,
  commitment: string
): RegistryAttestationState {
  const normalized = commitment.trim().toLowerCase();
  return normalizeRegistryAttestationState({
    credentialCommitments: [...state.credentialCommitments, normalized],
    revocationStatuses: state.revocationStatuses,
  });
}

export function setRevocationStatus(
  state: RegistryAttestationState,
  commitment: string,
  revoked: boolean
): RegistryAttestationState {
  const normalizedCommitment = commitment.trim().toLowerCase();
  const nextStatuses = state.revocationStatuses.filter((leaf) => leaf.commitment !== normalizedCommitment);
  nextStatuses.push(
    RevocationStatusLeafSchema.parse({
      version: "mintra.revocation-status/v1",
      commitment: normalizedCommitment,
      revoked,
    })
  );
  return normalizeRegistryAttestationState({
    credentialCommitments: state.credentialCommitments,
    revocationStatuses: nextStatuses,
  });
}

export function hexDigestToField(hex: string): Field {
  return Field(BigInt(`0x${hex}`));
}

function dedupeAndSort(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeRevocationStatuses(values: RevocationStatusLeaf[]): RevocationStatusLeaf[] {
  const deduped = new Map<string, RevocationStatusLeaf>();
  for (const entry of values) {
    const leaf = RevocationStatusLeafSchema.parse(entry);
    deduped.set(leaf.commitment, leaf);
  }
  return Array.from(deduped.values()).sort((left, right) => left.commitment.localeCompare(right.commitment));
}
