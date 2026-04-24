import type { NormalizedClaims } from "./verification";
import {
  CredentialMetadataSchema,
  type CredentialMetadata,
  type CredentialV2,
  type MinaCredentialData,
} from "@mintra/credential-v2";

export { ASSURANCE_LEVEL, CREDENTIAL_MODE, CredentialMetadataSchema, EVIDENCE_CLASS } from "@mintra/credential-v2";
export type { CredentialMetadata, CredentialV2, MinaCredentialData } from "@mintra/credential-v2";

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
