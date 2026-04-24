import { describe, expect, it } from "vitest";
import { createZkPolicyRequest } from "../index";

describe("zk policy request helpers", () => {
  it("creates a stable age-threshold zk policy request", () => {
    const request = createZkPolicyRequest({
      audience: "https://app.example.com",
      verifier: "https://verifier.example.com",
      minAge: 21,
      referenceDate: "2026-04-24",
    });

    expect(request.version).toBe("mintra.zk-policy/v1");
    expect(request.proofType).toBe("mintra.zk.age-threshold/v1");
    expect(request.requirements.ageGte).toBe(21);
    expect(request.publicInputs.referenceDate).toBe("2026-04-24");
    expect(request.publicInputs.commitmentKey).toBe("dob_poseidon_commitment");
    expect(request.metadata?.credentialModel).toBe("mintra.credential-v2");
  });

  it("creates a stable kyc-passed zk policy request", () => {
    const request = createZkPolicyRequest({
      audience: "https://app.example.com",
      verifier: "https://verifier.example.com",
      proofType: "mintra.zk.kyc-passed/v1",
    });

    expect(request.proofType).toBe("mintra.zk.kyc-passed/v1");
    expect(request.requirements.kycPassed).toBe(true);
    expect(request.publicInputs.commitmentKey).toBe("kyc_passed_poseidon_commitment");
  });

  it("creates a stable country-membership zk policy request", () => {
    const request = createZkPolicyRequest({
      audience: "https://app.example.com",
      verifier: "https://verifier.example.com",
      proofType: "mintra.zk.country-membership/v1",
      countryAllowlist: ["BG", "DE"],
      countryBlocklist: ["US"],
    });

    expect(request.proofType).toBe("mintra.zk.country-membership/v1");
    expect(request.requirements.countryAllowlist).toEqual(["BG", "DE"]);
    expect(request.requirements.countryBlocklist).toEqual(["US"]);
    expect(request.publicInputs.commitmentKey).toBe("country_code_poseidon_commitment");
    expect(request.publicInputs.allowlistNumeric).toEqual([100, 276]);
    expect(request.publicInputs.blocklistNumeric).toEqual([840]);
  });
});
