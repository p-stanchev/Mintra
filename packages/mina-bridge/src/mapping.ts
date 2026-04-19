import type { NormalizedClaims, MinaCredentialData } from "@mintra/sdk-types";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json" with { type: "json" };

countries.registerLocale(enLocale);

export function claimsToCredentialData(
  claims: NormalizedClaims,
  issuedAt: number
): MinaCredentialData {
  const countryNumeric = claims.country_code
    ? Number(countries.alpha2ToNumeric(claims.country_code.toUpperCase()) ?? 0)
    : 0;

  return {
    ageOver18: claims.age_over_18 === true ? 1 : 0,
    kycPassed: claims.kyc_passed === true ? 1 : 0,
    countryCode: countryNumeric,
    issuedAt,
  };
}
