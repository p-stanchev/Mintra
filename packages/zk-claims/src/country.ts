import { Bool, Field, Poseidon, Struct, UInt32, ZkProgram } from "o1js";
import type { CredentialMetadata } from "@mintra/credential-v2";

export const COUNTRY_CODE_ZK_COMMITMENT_KEY = "country_code_poseidon_commitment";
const MAX_COUNTRY_POLICY_ENTRIES = 8;

export class CountryMembershipPublicInput extends Struct({
  countryCommitment: Field,
  allow0: UInt32,
  allow1: UInt32,
  allow2: UInt32,
  allow3: UInt32,
  allow4: UInt32,
  allow5: UInt32,
  allow6: UInt32,
  allow7: UInt32,
  block0: UInt32,
  block1: UInt32,
  block2: UInt32,
  block3: UInt32,
  block4: UInt32,
  block5: UInt32,
  block6: UInt32,
  block7: UInt32,
}) {}

export class CountryMembershipWitness extends Struct({
  countryCodeNumeric: UInt32,
  salt: Field,
}) {}

export const CountryMembershipProgram = ZkProgram({
  name: "MintraCountryMembershipProgram",
  publicInput: CountryMembershipPublicInput,
  methods: {
    proveCountryMembership: {
      privateInputs: [CountryMembershipWitness],
      async method(publicInput: CountryMembershipPublicInput, witness: CountryMembershipWitness) {
        const commitment = Poseidon.hash([witness.countryCodeNumeric.value, witness.salt]);
        commitment.assertEquals(publicInput.countryCommitment);

        const zero = UInt32.from(0);
        const allowValues = [
          publicInput.allow0,
          publicInput.allow1,
          publicInput.allow2,
          publicInput.allow3,
          publicInput.allow4,
          publicInput.allow5,
          publicInput.allow6,
          publicInput.allow7,
        ];
        const blockValues = [
          publicInput.block0,
          publicInput.block1,
          publicInput.block2,
          publicInput.block3,
          publicInput.block4,
          publicInput.block5,
          publicInput.block6,
          publicInput.block7,
        ];

        let anyAllow = Bool(false);
        let inAllowlist = Bool(false);
        for (const value of allowValues) {
          const active = value.equals(zero).not();
          anyAllow = anyAllow.or(active);
          inAllowlist = inAllowlist.or(active.and(witness.countryCodeNumeric.equals(value)));
        }

        let blocked = Bool(false);
        for (const value of blockValues) {
          const active = value.equals(zero).not();
          blocked = blocked.or(active.and(witness.countryCodeNumeric.equals(value)));
        }

        inAllowlist.or(anyAllow.not()).assertTrue();
        blocked.assertFalse();
      },
    },
  },
});

export class CountryMembershipClaimProof extends ZkProgram.Proof(CountryMembershipProgram) {}

let countryMembershipProgramCompiled:
  | Promise<{
      verificationKey: Awaited<
        ReturnType<typeof CountryMembershipProgram.compile>
      >["verificationKey"];
    }>
  | undefined;

export async function compileCountryMembershipProgram() {
  countryMembershipProgramCompiled ??= CountryMembershipProgram.compile().then(
    ({ verificationKey }) => ({
      verificationKey,
    })
  );
  return countryMembershipProgramCompiled;
}

export function createCountryCodeCommitment(input: {
  countryCodeNumeric: number;
  salt: string | bigint | number | Field;
}) {
  return Poseidon.hash([
    UInt32.from(input.countryCodeNumeric).value,
    input.salt instanceof Field ? input.salt : Field(input.salt),
  ]);
}

export function createCountryMembershipPublicInput(input: {
  countryCommitment: string | bigint | number | Field;
  allowlistNumeric?: number[];
  blocklistNumeric?: number[];
}) {
  const allowlist = padCountryPolicyList(input.allowlistNumeric ?? []);
  const blocklist = padCountryPolicyList(input.blocklistNumeric ?? []);
  const [allow0, allow1, allow2, allow3, allow4, allow5, allow6, allow7] = allowlist;
  const [block0, block1, block2, block3, block4, block5, block6, block7] = blocklist;

  return new CountryMembershipPublicInput({
    countryCommitment:
      input.countryCommitment instanceof Field ? input.countryCommitment : Field(input.countryCommitment),
    allow0: UInt32.from(allow0),
    allow1: UInt32.from(allow1),
    allow2: UInt32.from(allow2),
    allow3: UInt32.from(allow3),
    allow4: UInt32.from(allow4),
    allow5: UInt32.from(allow5),
    allow6: UInt32.from(allow6),
    allow7: UInt32.from(allow7),
    block0: UInt32.from(block0),
    block1: UInt32.from(block1),
    block2: UInt32.from(block2),
    block3: UInt32.from(block3),
    block4: UInt32.from(block4),
    block5: UInt32.from(block5),
    block6: UInt32.from(block6),
    block7: UInt32.from(block7),
  });
}

export function createCountryMembershipWitness(input: {
  countryCodeNumeric: number;
  salt: string | bigint | number | Field;
}) {
  return new CountryMembershipWitness({
    countryCodeNumeric: UInt32.from(input.countryCodeNumeric),
    salt: input.salt instanceof Field ? input.salt : Field(input.salt),
  });
}

export async function proveCountryMembership(input: {
  publicInput: CountryMembershipPublicInput;
  witness: CountryMembershipWitness;
}) {
  await compileCountryMembershipProgram();
  const result = await CountryMembershipProgram.proveCountryMembership(
    input.publicInput,
    input.witness
  );
  return result.proof;
}

export async function verifyCountryMembershipProof(input: {
  proof: CountryMembershipClaimProof;
}) {
  await compileCountryMembershipProgram();
  return CountryMembershipProgram.verify(input.proof);
}

export function createCountryCodeZkSourceCommitment(input: {
  countryCodeNumeric: number;
  salt: string | bigint | number;
}): {
  key: typeof COUNTRY_CODE_ZK_COMMITMENT_KEY;
  algorithm: "poseidon";
  encoding: "mintra.commitment/v1";
  value: string;
} {
  const fieldValue = createCountryCodeCommitment(input);
  return {
    key: COUNTRY_CODE_ZK_COMMITMENT_KEY,
    algorithm: "poseidon",
    encoding: "mintra.commitment/v1",
    value: fieldToHex(fieldValue),
  };
}

export function createCountryMembershipPublicInputFromCredentialMetadata(input: {
  credentialMetadata: CredentialMetadata;
  allowlistNumeric?: number[];
  blocklistNumeric?: number[];
}) {
  const commitment = readCountryCommitment(input.credentialMetadata);
  return createCountryMembershipPublicInput({
    countryCommitment: hexToField(commitment.value),
    ...(input.allowlistNumeric === undefined ? {} : { allowlistNumeric: input.allowlistNumeric }),
    ...(input.blocklistNumeric === undefined ? {} : { blocklistNumeric: input.blocklistNumeric }),
  });
}

export async function proveCountryMembershipFromCredentialMetadata(input: {
  credentialMetadata: CredentialMetadata;
  countryCodeNumeric: number;
  allowlistNumeric?: number[];
  blocklistNumeric?: number[];
  salt?: string | bigint | number | Field;
}) {
  const publicInput = createCountryMembershipPublicInputFromCredentialMetadata({
    credentialMetadata: input.credentialMetadata,
    ...(input.allowlistNumeric === undefined ? {} : { allowlistNumeric: input.allowlistNumeric }),
    ...(input.blocklistNumeric === undefined ? {} : { blocklistNumeric: input.blocklistNumeric }),
  });
  const witness = createCountryMembershipWitness({
    countryCodeNumeric: input.countryCodeNumeric,
    salt: input.salt ?? 0,
  });
  return proveCountryMembership({ publicInput, witness });
}

export function countryMembershipPublicInputToLists(publicInput: CountryMembershipPublicInput) {
  const allowlistNumeric = [
    publicInput.allow0,
    publicInput.allow1,
    publicInput.allow2,
    publicInput.allow3,
    publicInput.allow4,
    publicInput.allow5,
    publicInput.allow6,
    publicInput.allow7,
  ]
    .map((value) => Number(value.toString()))
    .filter((value) => value > 0);
  const blocklistNumeric = [
    publicInput.block0,
    publicInput.block1,
    publicInput.block2,
    publicInput.block3,
    publicInput.block4,
    publicInput.block5,
    publicInput.block6,
    publicInput.block7,
  ]
    .map((value) => Number(value.toString()))
    .filter((value) => value > 0);

  return {
    countryCommitment: publicInput.countryCommitment.toString(),
    allowlistNumeric,
    blocklistNumeric,
  };
}

function padCountryPolicyList(values: number[]): [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
] {
  if (values.length > MAX_COUNTRY_POLICY_ENTRIES) {
    throw new Error(`Country policy lists support at most ${MAX_COUNTRY_POLICY_ENTRIES} entries`);
  }

  return [
    values[0] ?? 0,
    values[1] ?? 0,
    values[2] ?? 0,
    values[3] ?? 0,
    values[4] ?? 0,
    values[5] ?? 0,
    values[6] ?? 0,
    values[7] ?? 0,
  ];
}

function fieldToHex(field: Field): string {
  return BigInt(field.toString()).toString(16).padStart(64, "0");
}

function hexToField(value: string): Field {
  return Field(BigInt(`0x${value}`));
}

function readCountryCommitment(credentialMetadata: CredentialMetadata) {
  if (credentialMetadata.version !== "v2") {
    throw new Error("Country proof generation requires credential metadata version v2");
  }

  const commitment = credentialMetadata.sourceCommitments[COUNTRY_CODE_ZK_COMMITMENT_KEY] as
    | { value: string; algorithm: string }
    | undefined;
  if (!commitment) {
    throw new Error(`Missing ${COUNTRY_CODE_ZK_COMMITMENT_KEY} in credential metadata`);
  }

  if (commitment.algorithm !== "poseidon") {
    throw new Error(
      `${COUNTRY_CODE_ZK_COMMITMENT_KEY} must use the poseidon algorithm for zk country proofs`
    );
  }

  return commitment;
}
