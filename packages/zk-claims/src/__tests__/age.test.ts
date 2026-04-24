import { describe, expect, it } from "vitest";
import { Field } from "o1js";
import {
  createAgeClaimPublicInput,
  createDateOfBirthCommitment,
  createDateOfBirthWitness,
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
});
