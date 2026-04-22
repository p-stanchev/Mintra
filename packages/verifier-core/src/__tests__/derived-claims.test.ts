import { describe, expect, it } from "vitest";
import { verifyCommitmentRelation, verifyDerivedClaim } from "../index";

describe("derived claim helpers", () => {
  it("verifies a matching derived claim", () => {
    const result = verifyDerivedClaim({
      claim: {
        key: "age_over_18",
        value: true,
        derivedFrom: ["dob_commitment"],
        relation: "derived from source age >= 18",
      },
      expectedValue: true,
    });

    expect(result.verified).toBe(true);
  });

  it("rejects a mismatched derived claim", () => {
    const result = verifyDerivedClaim({
      claim: {
        key: "kyc_passed",
        value: false,
        derivedFrom: ["kyc_review_commitment"],
        relation: "provider_decision == approved",
      },
      expectedValue: true,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/kyc_passed/i);
  });

  it("keeps commitment relation verification as an honest placeholder", () => {
    const result = verifyCommitmentRelation({
      claimKey: "age_over_18",
      commitmentKey: "dob_commitment",
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/future zk integration/i);
  });
});
