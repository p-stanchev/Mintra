import "reflect-metadata";

import {
  Field,
  PublicKey,
  SmartContract,
  State,
  VerificationKey,
  method,
  state,
} from "o1js";

/**
 * Shared on-chain trust anchors for Mintra integrations.
 *
 * This contract is intentionally policy-light:
 * site-specific rules stay off-chain, while Mina apps can read or pin shared
 * issuer and verification-key anchors here.
 */
export class MintraRegistry extends SmartContract {
  @state(PublicKey) issuerPublicKey: State<PublicKey> = State<PublicKey>();
  @state(Field) ageVkHash: State<Field> = State<Field>();
  @state(Field) kycVkHash: State<Field> = State<Field>();
  @state(Field) countryVkHash: State<Field> = State<Field>();
  @state(Field) credentialRoot: State<Field> = State<Field>();
  @state(Field) revocationRoot: State<Field> = State<Field>();

  @method async initialize(
    issuerPublicKey: PublicKey,
    ageVk: VerificationKey,
    kycVk: VerificationKey,
    countryVk: VerificationKey,
    credentialRoot: Field,
    revocationRoot: Field
  ) {
    this.self.requireSignature();

    const currentAgeHash = this.ageVkHash.getAndRequireEquals();
    currentAgeHash.assertEquals(Field(0));
    const currentKycHash = this.kycVkHash.getAndRequireEquals();
    currentKycHash.assertEquals(Field(0));
    const currentCountryHash = this.countryVkHash.getAndRequireEquals();
    currentCountryHash.assertEquals(Field(0));

    this.issuerPublicKey.set(issuerPublicKey);
    this.ageVkHash.set(ageVk.hash);
    this.kycVkHash.set(kycVk.hash);
    this.countryVkHash.set(countryVk.hash);
    this.credentialRoot.set(credentialRoot);
    this.revocationRoot.set(revocationRoot);
  }

  @method async updateTrustAnchors(
    issuerPublicKey: PublicKey,
    ageVk: VerificationKey,
    kycVk: VerificationKey,
    countryVk: VerificationKey,
    credentialRoot: Field,
    revocationRoot: Field
  ) {
    this.self.requireSignature();

    this.issuerPublicKey.set(issuerPublicKey);
    this.ageVkHash.set(ageVk.hash);
    this.kycVkHash.set(kycVk.hash);
    this.countryVkHash.set(countryVk.hash);
    this.credentialRoot.set(credentialRoot);
    this.revocationRoot.set(revocationRoot);
  }
}
