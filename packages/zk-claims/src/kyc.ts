import { Bool, Field, Poseidon, Struct, ZkProgram } from "o1js";
import type { CredentialMetadata } from "@mintra/credential-v2";

export const KYC_PASSED_ZK_COMMITMENT_KEY = "kyc_passed_poseidon_commitment";

export class KycPassedPublicInput extends Struct({
  kycCommitment: Field,
}) {}

export class KycPassedWitness extends Struct({
  kycPassed: Bool,
  salt: Field,
}) {}

export const KycPassedProgram = ZkProgram({
  name: "MintraKycPassedProgram",
  publicInput: KycPassedPublicInput,
  methods: {
    proveKycPassed: {
      privateInputs: [KycPassedWitness],
      async method(publicInput: KycPassedPublicInput, witness: KycPassedWitness) {
        const commitment = Poseidon.hash([witness.kycPassed.toField(), witness.salt]);
        commitment.assertEquals(publicInput.kycCommitment);
        witness.kycPassed.assertTrue();
      },
    },
  },
});

export class KycPassedClaimProof extends ZkProgram.Proof(KycPassedProgram) {}

let kycPassedProgramCompiled:
  | Promise<{
      verificationKey: Awaited<ReturnType<typeof KycPassedProgram.compile>>["verificationKey"];
    }>
  | undefined;

export async function compileKycPassedProgram() {
  kycPassedProgramCompiled ??= KycPassedProgram.compile().then(({ verificationKey }) => ({
    verificationKey,
  }));
  return kycPassedProgramCompiled;
}

export function createKycPassedCommitment(input: {
  kycPassed: boolean;
  salt: string | bigint | number | Field;
}) {
  return Poseidon.hash([Bool(input.kycPassed).toField(), input.salt instanceof Field ? input.salt : Field(input.salt)]);
}

export function createKycPassedPublicInput(input: {
  kycCommitment: string | bigint | number | Field;
}) {
  return new KycPassedPublicInput({
    kycCommitment:
      input.kycCommitment instanceof Field ? input.kycCommitment : Field(input.kycCommitment),
  });
}

export function createKycPassedWitness(input: {
  kycPassed: boolean;
  salt: string | bigint | number | Field;
}) {
  return new KycPassedWitness({
    kycPassed: Bool(input.kycPassed),
    salt: input.salt instanceof Field ? input.salt : Field(input.salt),
  });
}

export async function proveKycPassedClaim(input: {
  publicInput: KycPassedPublicInput;
  witness: KycPassedWitness;
}) {
  await compileKycPassedProgram();
  const result = await KycPassedProgram.proveKycPassed(input.publicInput, input.witness);
  return result.proof;
}

export async function verifyKycPassedClaimProof(input: {
  proof: KycPassedClaimProof;
}) {
  await compileKycPassedProgram();
  return KycPassedProgram.verify(input.proof);
}

export function createKycPassedZkSourceCommitment(input: {
  kycPassed: boolean;
  salt: string | bigint | number;
}): {
  key: typeof KYC_PASSED_ZK_COMMITMENT_KEY;
  algorithm: "poseidon";
  encoding: "mintra.commitment/v1";
  value: string;
} {
  const fieldValue = createKycPassedCommitment(input);
  return {
    key: KYC_PASSED_ZK_COMMITMENT_KEY,
    algorithm: "poseidon",
    encoding: "mintra.commitment/v1",
    value: fieldToHex(fieldValue),
  };
}

export function createKycPassedPublicInputFromCredentialMetadata(input: {
  credentialMetadata: CredentialMetadata;
}) {
  const commitment = readKycCommitment(input.credentialMetadata);
  return createKycPassedPublicInput({
    kycCommitment: hexToField(commitment.value),
  });
}

export async function proveKycPassedFromCredentialMetadata(input: {
  credentialMetadata: CredentialMetadata;
  kycPassed: boolean;
  salt?: string | bigint | number | Field;
}) {
  const publicInput = createKycPassedPublicInputFromCredentialMetadata({
    credentialMetadata: input.credentialMetadata,
  });
  const witness = createKycPassedWitness({
    kycPassed: input.kycPassed,
    salt: input.salt ?? 0,
  });
  return proveKycPassedClaim({ publicInput, witness });
}

function fieldToHex(field: Field): string {
  return BigInt(field.toString()).toString(16).padStart(64, "0");
}

function hexToField(value: string): Field {
  return Field(BigInt(`0x${value}`));
}

function readKycCommitment(credentialMetadata: CredentialMetadata) {
  if (credentialMetadata.version !== "v2") {
    throw new Error("KYC proof generation requires credential metadata version v2");
  }

  const commitment = credentialMetadata.sourceCommitments[KYC_PASSED_ZK_COMMITMENT_KEY] as
    | { value: string; algorithm: string }
    | undefined;
  if (!commitment) {
    throw new Error(`Missing ${KYC_PASSED_ZK_COMMITMENT_KEY} in credential metadata`);
  }

  if (commitment.algorithm !== "poseidon") {
    throw new Error(
      `${KYC_PASSED_ZK_COMMITMENT_KEY} must use the poseidon algorithm for zk KYC proofs`
    );
  }

  return commitment;
}
