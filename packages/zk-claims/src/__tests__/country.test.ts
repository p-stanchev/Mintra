import { describe, expect, it } from "vitest";
import {
  COUNTRY_CODE_ZK_COMMITMENT_KEY,
  countryMembershipPublicInputToLists,
  createCountryCodeCommitment,
  createCountryCodeZkSourceCommitment,
  createCountryMembershipPublicInput,
  createCountryMembershipWitness,
  proveCountryMembership,
  proveCountryMembershipFromCredentialMetadata,
  verifyCountryMembershipProof,
} from "../country";

describe("CountryMembershipProgram", () => {
  it("proves allowlist membership", async () => {
    const publicInput = createCountryMembershipPublicInput({
      countryCommitment: createCountryCodeCommitment({
        countryCodeNumeric: 100,
        salt: 0,
      }),
      allowlistNumeric: [100, 40],
    });

    const witness = createCountryMembershipWitness({
      countryCodeNumeric: 100,
      salt: 0,
    });

    const proof = await proveCountryMembership({ publicInput, witness });
    const verified = await verifyCountryMembershipProof({ proof });
    expect(verified).toBe(true);
    expect(countryMembershipPublicInputToLists(proof.publicInput).allowlistNumeric).toEqual([100, 40]);
  }, 120000);

  it("proves from Mintra credential metadata", async () => {
    const credentialMetadata = {
      version: "v2" as const,
      sourceCommitments: {
        [COUNTRY_CODE_ZK_COMMITMENT_KEY]: createCountryCodeZkSourceCommitment({
          countryCodeNumeric: 100,
          salt: 0,
        }),
      },
      derivedClaims: {},
    };

    const proof = await proveCountryMembershipFromCredentialMetadata({
      credentialMetadata,
      countryCodeNumeric: 100,
      allowlistNumeric: [100],
      blocklistNumeric: [],
    });
    const verified = await verifyCountryMembershipProof({ proof });
    expect(verified).toBe(true);
  }, 120000);
});
