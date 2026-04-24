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
    expect(request.publicInputs.commitmentKey).toBe("dob_commitment");
    expect(request.metadata?.credentialModel).toBe("mintra.credential-v2");
  });
});
