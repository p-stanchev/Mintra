import { describe, expect, it } from "vitest";
import {
  KYC_PASSED_ZK_COMMITMENT_KEY,
  createKycPassedPublicInput,
  createKycPassedCommitment,
  createKycPassedWitness,
  createKycPassedZkSourceCommitment,
  proveKycPassedClaim,
  proveKycPassedFromCredentialMetadata,
  verifyKycPassedClaimProof,
} from "../kyc";

describe("KycPassedProgram", () => {
  it("proves and verifies kyc passed", async () => {
    const publicInput = createKycPassedPublicInput({
      kycCommitment: createKycPassedCommitment({
        kycPassed: true,
        salt: 0,
      }),
    });

    const witness = createKycPassedWitness({
      kycPassed: true,
      salt: 0,
    });

    const proof = await proveKycPassedClaim({ publicInput, witness });
    const verified = await verifyKycPassedClaimProof({ proof });
    expect(verified).toBe(true);
  }, 120000);

  it("proves from Mintra credential metadata", async () => {
    const credentialMetadata = {
      version: "v2" as const,
      sourceCommitments: {
        [KYC_PASSED_ZK_COMMITMENT_KEY]: createKycPassedZkSourceCommitment({
          kycPassed: true,
          salt: 0,
        }),
      },
      derivedClaims: {},
    };

    const proof = await proveKycPassedFromCredentialMetadata({
      credentialMetadata,
      kycPassed: true,
    });
    const verified = await verifyKycPassedClaimProof({ proof });
    expect(verified).toBe(true);
  }, 120000);
});
