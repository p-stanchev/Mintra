// Optional zkApp integration scaffold for Mintra.
// This file is not wired into the production build. It documents the boundary
// between Mintra's off-chain verifier and an on-chain age-gated action.

import { Bool, Field, SmartContract, method, state, State } from "o1js";

export class AgeGateExample extends SmartContract {
  @state(Bool) ageGateEnabled = State<Bool>();
  @state(Field) lastVerifierRoot = State<Field>();

  init() {
    super.init();
    this.ageGateEnabled.set(Bool(true));
    this.lastVerifierRoot.set(Field(0));
  }

  @method async useProtectedAction(
    ageOver18: Bool,
    verifierRoot: Field
  ) {
    const gateEnabled = this.ageGateEnabled.getAndRequireEquals();
    gateEnabled.assertTrue();

    // Placeholder integration point:
    // In a future production version this method would consume a proof
    // generated from Mintra verifier output, or verify membership in an
    // anchored verifier state root.
    ageOver18.assertTrue("The caller must prove age_over_18.");

    this.lastVerifierRoot.set(verifierRoot);
  }
}
