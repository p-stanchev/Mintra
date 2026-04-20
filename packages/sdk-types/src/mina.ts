import type { NormalizedClaims } from "./verification";

export interface MinaCredentialData {
  ageOver18: 0 | 1;
  ageOver21: 0 | 1;
  kycPassed: 0 | 1;
  countryCode: number; // ISO 3166-1 numeric (0 = not provided)
  issuedAt: number;    // Unix timestamp seconds
}

export interface MinaIssuanceRequest {
  userId: string;
  claims: NormalizedClaims;
  ownerPublicKey: string; // Mina public key, Base58
}

export interface MinaIssuanceResult {
  credentialJson: string; // serialized mina-attestations credential
  issuerPublicKey: string;
}
