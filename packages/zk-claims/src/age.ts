import {
  Field,
  Poseidon,
  Provable,
  Struct,
  UInt32,
  ZkProgram,
} from "o1js";
import type { CredentialMetadata } from "@mintra/credential-v2";

export const DOB_ZK_COMMITMENT_KEY = "dob_poseidon_commitment";

export class AgeClaimPublicInput extends Struct({
  dobCommitment: Field,
  minAge: UInt32,
  referenceYear: UInt32,
  referenceMonth: UInt32,
  referenceDay: UInt32,
}) {}

export class DateOfBirthWitness extends Struct({
  year: UInt32,
  month: UInt32,
  day: UInt32,
  salt: Field,
}) {}

export const AgeClaimProgram = ZkProgram({
  name: "MintraAgeClaimProgram",
  publicInput: AgeClaimPublicInput,
  methods: {
    proveAgeThreshold: {
      privateInputs: [DateOfBirthWitness],
      async method(publicInput: AgeClaimPublicInput, witness: DateOfBirthWitness) {
        assertMonthRange(publicInput.referenceMonth);
        assertDayRange(publicInput.referenceDay);
        assertMonthRange(witness.month);
        assertDayRange(witness.day);

        const dobCommitment = Poseidon.hash([
          witness.year.value,
          witness.month.value,
          witness.day.value,
          witness.salt,
        ]);
        dobCommitment.assertEquals(publicInput.dobCommitment);

        const birthMonthBeforeRef = witness.month.lessThan(publicInput.referenceMonth);
        const birthMonthMatchesRef = witness.month.equals(publicInput.referenceMonth);
        const birthDayOnOrBeforeRef = witness.day.lessThanOrEqual(publicInput.referenceDay);
        const hadBirthday = birthMonthBeforeRef.or(
          birthMonthMatchesRef.and(birthDayOnOrBeforeRef)
        );

        const ageYears = publicInput.referenceYear.sub(witness.year);
        const adjustedAge = Provable.if(
          hadBirthday,
          UInt32,
          ageYears,
          ageYears.sub(UInt32.from(1))
        );

        adjustedAge.assertGreaterThanOrEqual(publicInput.minAge);
      },
    },
  },
});

export class AgeClaimProof extends ZkProgram.Proof(AgeClaimProgram) {}

let ageClaimProgramCompiled:
  | Promise<{
      verificationKey: Awaited<ReturnType<typeof AgeClaimProgram.compile>>["verificationKey"];
    }>
  | undefined;

export async function compileAgeClaimProgram() {
  ageClaimProgramCompiled ??= AgeClaimProgram.compile().then(({ verificationKey }) => ({
    verificationKey,
  }));
  return ageClaimProgramCompiled;
}

export function createDateOfBirthCommitment(input: {
  year: number;
  month: number;
  day: number;
  salt: string | bigint | number;
}) {
  return Poseidon.hash([
    UInt32.from(input.year).value,
    UInt32.from(input.month).value,
    UInt32.from(input.day).value,
    Field(input.salt),
  ]);
}

export function createAgeClaimPublicInput(input: {
  dobCommitment: string | bigint | number | Field;
  minAge: 18 | 21 | number;
  referenceDate: string | Date;
}) {
  const reference = parseIsoDate(input.referenceDate);
  return new AgeClaimPublicInput({
    dobCommitment:
      input.dobCommitment instanceof Field ? input.dobCommitment : Field(input.dobCommitment),
    minAge: UInt32.from(input.minAge),
    referenceYear: UInt32.from(reference.year),
    referenceMonth: UInt32.from(reference.month),
    referenceDay: UInt32.from(reference.day),
  });
}

export function createDateOfBirthWitness(input: {
  dateOfBirth: string | Date;
  salt: string | bigint | number | Field;
}) {
  const dob = parseIsoDate(input.dateOfBirth);
  return new DateOfBirthWitness({
    year: UInt32.from(dob.year),
    month: UInt32.from(dob.month),
    day: UInt32.from(dob.day),
    salt: input.salt instanceof Field ? input.salt : Field(input.salt),
  });
}

export async function proveAgeClaim(input: {
  publicInput: AgeClaimPublicInput;
  witness: DateOfBirthWitness;
}) {
  await compileAgeClaimProgram();
  const result = await AgeClaimProgram.proveAgeThreshold(input.publicInput, input.witness);
  return result.proof;
}

export async function verifyAgeClaimProof(input: {
  proof: AgeClaimProof;
}) {
  await compileAgeClaimProgram();
  return AgeClaimProgram.verify(input.proof);
}

export function createDateOfBirthZkSourceCommitment(input: {
  year: number;
  month: number;
  day: number;
  salt: string | bigint | number;
}): {
  key: typeof DOB_ZK_COMMITMENT_KEY;
  algorithm: "poseidon";
  encoding: "mintra.commitment/v1";
  value: string;
} {
  const fieldValue = createDateOfBirthCommitment(input);
  return {
    key: DOB_ZK_COMMITMENT_KEY,
    algorithm: "poseidon",
    encoding: "mintra.commitment/v1",
    value: fieldToHex(fieldValue),
  };
}

export function createAgeClaimPublicInputFromCredentialMetadata(input: {
  credentialMetadata: CredentialMetadata;
  minAge: 18 | 21 | number;
  referenceDate: string | Date;
}) {
  const commitment = readDobZkCommitment(input.credentialMetadata);
  return createAgeClaimPublicInput({
    dobCommitment: hexToField(commitment.value),
    minAge: input.minAge,
    referenceDate: input.referenceDate,
  });
}

export async function proveAgeClaimFromCredentialMetadata(input: {
  credentialMetadata: CredentialMetadata;
  dateOfBirth: string | Date;
  salt?: string | bigint | number | Field;
  minAge: 18 | 21 | number;
  referenceDate: string | Date;
}) {
  const publicInput = createAgeClaimPublicInputFromCredentialMetadata({
    credentialMetadata: input.credentialMetadata,
    minAge: input.minAge,
    referenceDate: input.referenceDate,
  });
  const witness = createDateOfBirthWitness({
    dateOfBirth: input.dateOfBirth,
    salt: input.salt ?? 0,
  });

  return proveAgeClaim({ publicInput, witness });
}

function assertMonthRange(month: UInt32) {
  month.assertGreaterThanOrEqual(UInt32.from(1));
  month.assertLessThanOrEqual(UInt32.from(12));
}

function assertDayRange(day: UInt32) {
  day.assertGreaterThanOrEqual(UInt32.from(1));
  day.assertLessThanOrEqual(UInt32.from(31));
}

function parseIsoDate(value: string | Date) {
  if (value instanceof Date) {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
    };
  }

  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new Error(`Expected ISO date in YYYY-MM-DD format, received: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function fieldToHex(field: Field): string {
  return BigInt(field.toString()).toString(16).padStart(64, "0");
}

function hexToField(value: string): Field {
  return Field(BigInt(`0x${value}`));
}

function readDobZkCommitment(credentialMetadata: CredentialMetadata) {
  if (credentialMetadata.version !== "v2") {
    throw new Error("Age proof generation requires credential metadata version v2");
  }

  const commitment = credentialMetadata.sourceCommitments[DOB_ZK_COMMITMENT_KEY] as
    | { value: string; algorithm: string }
    | undefined;
  if (!commitment) {
    throw new Error(`Missing ${DOB_ZK_COMMITMENT_KEY} in credential metadata`);
  }

  if (commitment.algorithm !== "poseidon") {
    throw new Error(
      `${DOB_ZK_COMMITMENT_KEY} must use the poseidon algorithm for zk age proofs`
    );
  }

  return commitment;
}
