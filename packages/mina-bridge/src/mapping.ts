import {
  ASSURANCE_LEVEL,
  CREDENTIAL_MODE,
  EVIDENCE_CLASS,
  type CredentialMetadata,
  type CredentialTrust,
  type NormalizedClaims,
  type MinaCredentialData,
} from "@mintra/sdk-types";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json" with { type: "json" };

countries.registerLocale(enLocale);

export function claimsToCredentialData(
  claims: NormalizedClaims,
  issuedAt: number,
  credentialMetadata?: CredentialMetadata
): MinaCredentialData {
  const countryNumeric = claims.country_code
    ? Number(countries.alpha2ToNumeric(claims.country_code.toUpperCase()) ?? 0)
    : 0;
  const nationalityNumeric = claims.nationality
    ? normalizeNationalityNumeric(claims.nationality)
    : 0;
  const documentExpiresAt = encodeDocumentExpiresAt(claims.document_expires_at);
  const credentialTrust = readCredentialTrust(credentialMetadata);
  const isDemoCredential = credentialTrust?.demoCredential === true ? 1 : 0;
  const credentialMode = credentialTrust?.issuerEnvironment === "demo"
    ? CREDENTIAL_MODE.demo
    : CREDENTIAL_MODE.production;
  const assuranceLevel = credentialTrust
    ? ASSURANCE_LEVEL[credentialTrust.assuranceLevel]
    : ASSURANCE_LEVEL.medium;
  const evidenceClass = credentialTrust
    ? EVIDENCE_CLASS[credentialTrust.evidenceClass]
    : EVIDENCE_CLASS["provider-normalized"];

  return {
    ageOver18: claims.age_over_18 === true ? 1 : 0,
    ageOver21: claims.age_over_21 === true ? 1 : 0,
    kycPassed: claims.kyc_passed === true ? 1 : 0,
    countryCode: countryNumeric,
    nationalityCode: nationalityNumeric,
    documentExpiresAt,
    isDemoCredential,
    credentialMode,
    assuranceLevel,
    evidenceClass,
    issuedAt,
  };
}

function normalizeNationalityNumeric(value: string): number {
  const normalized = value.trim().toUpperCase();
  if (normalized.length === 3) {
    return Number(countries.alpha3ToNumeric(normalized) ?? 0);
  }
  if (normalized.length === 2) {
    return Number(countries.alpha2ToNumeric(normalized) ?? 0);
  }
  return 0;
}

function readCredentialTrust(credentialMetadata: CredentialMetadata | undefined): CredentialTrust | undefined {
  return credentialMetadata?.credentialTrust;
}

function encodeDocumentExpiresAt(value: string | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
}
