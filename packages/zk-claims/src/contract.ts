import { Field, SmartContract, State, UInt32, VerificationKey, method, state } from "o1js";
import { AgeClaimProof } from "./age.js";

/**
 * On-chain age gate zkApp.
 *
 * Deploy flow:
 *   1. Compile AgeClaimProgram to get its VerificationKey.
 *   2. Deploy MintraAgeGate.
 *   3. Call initialize(vk, minAge) to lock the VK hash and minimum age on-chain.
 *
 * Proving flow:
 *   1. Client generates an AgeClaimProof browser-side.
 *   2. Client calls proveAge(proof, vk) in a zkApp transaction.
 *   3. The circuit verifies the proof in-circuit against the stored VK hash.
 */
export class MintraAgeGate extends SmartContract {
  @state(Field) ageVkHash = State<Field>();
  @state(UInt32) minAge = State<UInt32>();

  /**
   * One-time initialization. Stores the AgeClaimProgram verification key hash
   * and minimum age requirement on-chain. Can only be called once (while vkHash is 0).
   */
  @method async initialize(vk: VerificationKey, minAge: UInt32) {
    const currentHash = this.ageVkHash.getAndRequireEquals();
    currentHash.assertEquals(Field(0));
    this.ageVkHash.set(vk.hash);
    this.minAge.set(minAge);
  }

  /**
   * Verifies a Mintra age ZK proof in-circuit. The proof must have been generated
   * by AgeClaimProgram and must satisfy the minimum age stored on-chain.
   */
  @method async proveAge(proof: AgeClaimProof, vk: VerificationKey) {
    const storedHash = this.ageVkHash.getAndRequireEquals();
    // Constrain the provided vk to exactly the one locked at initialization
    vk.hash.assertEquals(storedHash);
    // Cryptographic proof verification inside the circuit
    proof.verify(vk);
    // Enforce the age threshold matches (or exceeds) the on-chain requirement
    const required = this.minAge.getAndRequireEquals();
    proof.publicInput.minAge.assertGreaterThanOrEqual(required);
  }
}
