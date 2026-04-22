import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createStore } from "../store";

describe("Verification store claim expiry", () => {
  it("drops claims older than 1 year during hydrate", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mintra-store-"));
    const stateFile = path.join(tempRoot, "state.json");
    const now = Date.now();

    await fs.writeFile(
      stateFile,
      JSON.stringify({
        verifications: [],
        claims: [
          {
            userId: "B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ",
            verificationId: "expired-verification-id",
            ageOver18: true,
            kycPassed: true,
            countryCode: "BG",
            verifiedAt: new Date(now - 366 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
        processedWebhooks: [],
      }),
      "utf8"
    );

    const store = await createStore(stateFile);
    const claim = await store.getClaims("B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ");

    expect(claim).toBeUndefined();

    await store.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("hydrates v2 commitment-backed claims", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mintra-store-"));
    const stateFile = path.join(tempRoot, "state.json");

    await fs.writeFile(
      stateFile,
      JSON.stringify({
        verifications: [],
        claims: [
          {
            userId: "B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ",
            verificationId: "v2-verification-id",
            ageOver18: true,
            ageOver21: null,
            kycPassed: true,
            countryCode: "BG",
            claimModelVersion: "v2",
            derivedClaims: {
              age_over_18: {
                key: "age_over_18",
                value: true,
                derivedFrom: ["dob_commitment"],
                derivationMethod: "didit.age-threshold.gte-18",
                derivationVersion: "didit/v3",
                assuranceLevel: "high",
                evidenceClass: "provider-normalized",
                relation: "derived from source age >= 18",
              },
            },
            sourceCommitments: {
              dob_commitment: {
                key: "dob_commitment",
                algorithm: "sha256",
                encoding: "mintra.commitment/v1",
                value: "c".repeat(64),
              },
            },
            verifiedAt: new Date().toISOString(),
          },
        ],
        processedWebhooks: [],
      }),
      "utf8"
    );

    const store = await createStore(stateFile);
    const claim = await store.getClaims("B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ");

    expect(claim?.claimModelVersion).toBe("v2");
    expect(claim?.sourceCommitments?.dob_commitment.value).toBe("c".repeat(64));
    expect(claim?.derivedClaims?.age_over_18.value).toBe(true);

    await store.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
