import type { NormalizedClaims } from "./verification";
import {
  ClaimAttestationsSchema,
  createClaimAttestation,
  CredentialMetadataSchema,
  type ClaimAttestations,
  type CredentialMetadata,
  type CredentialV2,
  type MinaCredentialData,
} from "@mintra/credential-v2";

export { ASSURANCE_LEVEL, CREDENTIAL_MODE, CredentialMetadataSchema, EVIDENCE_CLASS } from "@mintra/credential-v2";
export type { ClaimAttestations, CredentialMetadata, CredentialV2, MinaCredentialData } from "@mintra/credential-v2";

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

export async function createRegistryClaimAttestations(params: {
  walletAddress: string;
  issuerPublicKey: string;
  claims: NormalizedClaims;
  expiresAt: string | Date;
}): Promise<ClaimAttestations> {
  const entries = await Promise.all(
    Object.entries(params.claims)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(async ([claimType, value]) => {
        const attestation = await createClaimAttestation({
          claimType,
          value: value as string | number | boolean,
          subject: params.walletAddress,
          issuerPublicKey: params.issuerPublicKey,
          expiresAt: params.expiresAt,
        });
        return [claimType, attestation] as const;
      })
  );

  return ClaimAttestationsSchema.parse(Object.fromEntries(entries));
}
