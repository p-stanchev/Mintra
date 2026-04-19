import type { NormalizedClaims, MinaCredentialData } from "@mintra/sdk-types";

// ISO 3166-1 alpha-2 → numeric. Extend as needed.
const COUNTRY_NUMERIC: Record<string, number> = {
  AF: 4,   AL: 8,   DZ: 12,  AR: 32,  AU: 36,  AT: 40,  BE: 56,
  BR: 76,  CA: 124, CN: 156, CO: 170, HR: 191, CZ: 203, DK: 208,
  EG: 818, FI: 246, FR: 250, DE: 276, GH: 288, GR: 300, HU: 348,
  IN: 356, ID: 360, IE: 372, IL: 376, IT: 380, JP: 392, KE: 404,
  MX: 484, NL: 528, NZ: 554, NG: 566, NO: 578, PK: 586, PL: 616,
  PT: 620, RO: 642, RU: 643, SA: 682, ZA: 710, ES: 724, SE: 752,
  CH: 756, TR: 792, UA: 804, GB: 826, US: 840,
};

export function claimsToCredentialData(
  claims: NormalizedClaims,
  issuedAt: number
): MinaCredentialData {
  const countryNumeric = claims.country_code
    ? (COUNTRY_NUMERIC[claims.country_code.toUpperCase()] ?? 0)
    : 0;

  return {
    ageOver18: claims.age_over_18 === true ? 1 : 0,
    kycPassed: claims.kyc_passed === true ? 1 : 0,
    countryCode: countryNumeric,
    issuedAt,
  };
}
