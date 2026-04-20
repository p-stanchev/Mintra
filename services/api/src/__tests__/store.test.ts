import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createStore } from "../store";

describe("Verification store claim expiry", () => {
  it("drops claims older than 30 days during hydrate", async () => {
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
            verifiedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
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
});
