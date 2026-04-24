import "reflect-metadata";

import {
  Bool,
  DynamicProof,
  Empty,
  Field,
  SmartContract,
  State,
  UInt32,
  VerificationKey,
  method,
  state,
} from "o1js";
import { AgeClaimPublicInput, KycPassedPublicInput } from "@mintra/zk-claims";

/**
 * Dynamic proof wrapper for on-chain verification.
 * The verification key is supplied at method-call time and checked against the
 * hash stored on-chain, so the contract only accepts the intended circuit.
 */
export class AgeClaimDynamicProof extends DynamicProof<AgeClaimPublicInput, Empty> {
  static override publicInputType = AgeClaimPublicInput;
  static override publicOutputType = Empty;
  static override maxProofsVerified = 0 as const;
}

export class KycPassedDynamicProof extends DynamicProof<KycPassedPublicInput, Empty> {
  static override publicInputType = KycPassedPublicInput;
  static override publicOutputType = Empty;
  static override maxProofsVerified = 0 as const;
}

/**
 * Optional zkApp extension for age-gated on-chain actions.
 *
 * This is intentionally separate from Mintra's off-chain verifier path.
 * It stores the accepted proof verification-key hash and minimum age policy on-chain.
 */
export class MintraAgeGate extends SmartContract {
  @state(Field) ageVkHash: State<Field> = State<Field>();
  @state(Field) kycVkHash: State<Field> = State<Field>();
  @state(UInt32) minAge: State<UInt32> = State<UInt32>();
  @state(Bool) requireKycPassed: State<Bool> = State<Bool>();

  @method async initialize(
    ageVk: VerificationKey,
    kycVk: VerificationKey,
    minAge: UInt32,
    requireKycPassed: Bool
  ) {
    this.self.requireSignature();

    const currentHash = this.ageVkHash.getAndRequireEquals();
    currentHash.assertEquals(Field(0));
    const currentKycHash = this.kycVkHash.getAndRequireEquals();
    currentKycHash.assertEquals(Field(0));

    this.ageVkHash.set(ageVk.hash);
    this.kycVkHash.set(kycVk.hash);
    this.minAge.set(minAge);
    this.requireKycPassed.set(requireKycPassed);
  }

  @method async proveAge(proof: AgeClaimDynamicProof, vk: VerificationKey) {
    const storedHash = this.ageVkHash.getAndRequireEquals();
    vk.hash.assertEquals(storedHash);
    proof.verify(vk);

    const required = this.minAge.getAndRequireEquals();
    proof.publicInput.minAge.assertGreaterThanOrEqual(required);
  }

  @method async proveKycPassed(proof: KycPassedDynamicProof, vk: VerificationKey) {
    const requireKycPassed = this.requireKycPassed.getAndRequireEquals();
    requireKycPassed.assertTrue();

    const storedHash = this.kycVkHash.getAndRequireEquals();
    vk.hash.assertEquals(storedHash);
    proof.verify(vk);
  }

  @method async proveAgeOnly(proof: AgeClaimDynamicProof, vk: VerificationKey) {
    const requireKycPassed = this.requireKycPassed.getAndRequireEquals();
    requireKycPassed.assertFalse();

    const storedHash = this.ageVkHash.getAndRequireEquals();
    vk.hash.assertEquals(storedHash);
    proof.verify(vk);

    const required = this.minAge.getAndRequireEquals();
    proof.publicInput.minAge.assertGreaterThanOrEqual(required);
  }

  @method async proveAgeAndKycPassed(
    ageProof: AgeClaimDynamicProof,
    ageVk: VerificationKey,
    kycProof: KycPassedDynamicProof,
    kycVk: VerificationKey
  ) {
    const requireKycPassed = this.requireKycPassed.getAndRequireEquals();
    requireKycPassed.assertTrue();

    const storedAgeHash = this.ageVkHash.getAndRequireEquals();
    ageVk.hash.assertEquals(storedAgeHash);
    ageProof.verify(ageVk);

    const required = this.minAge.getAndRequireEquals();
    ageProof.publicInput.minAge.assertGreaterThanOrEqual(required);

    const storedKycHash = this.kycVkHash.getAndRequireEquals();
    kycVk.hash.assertEquals(storedKycHash);
    kycProof.verify(kycVk);
  }

  @method async updatePolicy(
    ageVk: VerificationKey,
    kycVk: VerificationKey,
    minAge: UInt32,
    requireKycPassed: Bool
  ) {
    this.self.requireSignature();
    this.ageVkHash.set(ageVk.hash);
    this.kycVkHash.set(kycVk.hash);
    this.minAge.set(minAge);
    this.requireKycPassed.set(requireKycPassed);
  }
}
