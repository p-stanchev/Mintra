import { describe, expect, it } from "vitest";
import { Field } from "o1js";
import {
  DOB_ZK_COMMITMENT_KEY,
  createAgeClaimPublicInput,
  createDateOfBirthCommitment,
  createDateOfBirthZkSourceCommitment,
  createDateOfBirthWitness,
  proveAgeClaimFromCredentialMetadata,
  proveAgeClaim,
  verifyAgeClaimProof,
} from "../age";

describe("AgeClaimProgram", () => {
  it("proves and verifies age >= 18 without revealing dob publicly", async () => {
    const salt = Field(123456);
    const publicInput = createAgeClaimPublicInput({
      dobCommitment: createDateOfBirthCommitment({
        year: 1990,
        month: 6,
        day: 15,
        salt,
      }),
      minAge: 18,
      referenceDate: "2026-04-24",
    });

    const witness = createDateOfBirthWitness({
      dateOfBirth: "1990-06-15",
      salt,
    });

    const proof = await proveAgeClaim({ publicInput, witness });
    const verified = await verifyAgeClaimProof({ proof });

    expect(verified).toBe(true);
  }, 30000);

  it("proves from credential metadata returned by Mintra issuance", async () => {
    const credentialMetadata = {
      version: "v2" as const,
      sourceCommitments: {
        [DOB_ZK_COMMITMENT_KEY]: createDateOfBirthZkSourceCommitment({
          year: 1990,
          month: 6,
          day: 15,
          salt: 0,
        }),
      },
      derivedClaims: {},
    };

    const proof = await proveAgeClaimFromCredentialMetadata({
      credentialMetadata,
      dateOfBirth: "1990-06-15",
      minAge: 18,
      referenceDate: "2026-04-24",
    });

    const verified = await verifyAgeClaimProof({ proof });
    expect(verified).toBe(true);
  }, 30000);
});
