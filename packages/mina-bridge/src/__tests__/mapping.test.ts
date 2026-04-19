import { describe, it, expect } from "vitest";
import { claimsToCredentialData } from "../mapping";

describe("claimsToCredentialData", () => {
  const TS = 1_700_000_000;

  it("maps all positive claims", () => {
    const result = claimsToCredentialData(
      { age_over_18: true, kyc_passed: true, country_code: "AT" },
      TS
    );
    expect(result.ageOver18).toBe(1);
    expect(result.kycPassed).toBe(1);
    expect(result.countryCode).toBe(40); // AT = 40
    expect(result.issuedAt).toBe(TS);
  });

  it("maps absent/false claims to 0", () => {
    const result = claimsToCredentialData({}, TS);
    expect(result.ageOver18).toBe(0);
    expect(result.kycPassed).toBe(0);
    expect(result.countryCode).toBe(0);
  });

  it("maps US country code to 840", () => {
    const result = claimsToCredentialData({ country_code: "US" }, TS);
    expect(result.countryCode).toBe(840);
  });

  it("maps unknown country code to 0", () => {
    const result = claimsToCredentialData({ country_code: "XX" }, TS);
    expect(result.countryCode).toBe(0);
  });

  it("is case-insensitive for country codes", () => {
    const lower = claimsToCredentialData({ country_code: "de" }, TS);
    const upper = claimsToCredentialData({ country_code: "DE" }, TS);
    expect(lower.countryCode).toBe(276);
    expect(upper.countryCode).toBe(276);
  });
});
