import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json" with { type: "json" };
import {
  ClaimAttestationSchema,
  RegistryClaimProofsSchema,
  verifyRegistryClaimProof,
  hashSubjectToHex,
} from "@mintra/credential-v2";
import {
  type AssuranceLevel,
  type ClaimModelVersion,
  type CredentialTrust,
  type DerivedClaim,
  type DerivedClaims,
  type EvidenceClass,
  type HolderBinding,
  type HolderBindingVerification,
  type PasskeyAssertion,
  type PasskeyAuthenticationRequest,
  PasskeySignedPayloadSchema,
  type PasskeyBinding,
  type PresentationChallenge,
  type PresentationEnvelope,
  PresentationEnvelopeSchema,
  type PresentationRequestEnvelope,
  PresentationRequestEnvelopeSchema,
  type PresentationVerificationResult,
  type PresentationVerificationOutput,
  type ProofProduct,
  type ProofProductId,
  type SerializedPresentationRequest,
  type VerifierPolicy as NormalizedVerifierPolicy,
  type ZkPolicyRequest,
  ZkAgeThresholdPolicyRequestSchema,
  ZkCountryMembershipPolicyRequestSchema,
  ZkKycPassedPolicyRequestSchema,
} from "@mintra/sdk-types";

countries.registerLocale(enLocale);

let cachedPresentationTools:
  | Promise<{
      Credential: typeof import("mina-attestations").Credential;
      Operation: typeof import("mina-attestations").Operation;
      Presentation: typeof import("mina-attestations").Presentation;
      PresentationRequest: typeof import("mina-attestations").PresentationRequest;
      PresentationSpec: typeof import("mina-attestations").PresentationSpec;
      Field: typeof import("o1js").Field;
    }>
  | undefined;

export const DEFAULT_AGE_PROOF_ACTION = "mintra:protected-access";
const DEFAULT_PRESENTATION_TTL_SECONDS = 5 * 60;
export const DEFAULT_ZK_POLICY_TTL_SECONDS = 5 * 60;

export type AgeOver18PresentationRequest = unknown;

export interface VerifierPolicy {
  minAge?: 18 | 21 | null;
  requireKycPassed?: boolean;
  countryAllowlist?: string[];
  countryBlocklist?: string[];
  maxCredentialAgeDays?: number | null;
}

export interface VerifiedPresentationOutput extends PresentationVerificationOutput {
  ownerPublicKey: string;
}

export interface VerifyPresentationParams {
  request: AgeOver18PresentationRequest;
  presentationJson: string;
  verifierIdentity: string;
}

export interface CreatePresentationRequestOptions {
  proofProductId?: ProofProductId;
  policy?: VerifierPolicy;
  audience: string;
  verifier: string;
  subjectId?: string;
  walletAddress?: string | null;
  requirePasskeyBinding?: boolean;
  action?: string;
  expiresInSeconds?: number;
}

export type CreateZkPolicyRequestOptions =
  | {
      audience: string;
      verifier: string;
      proofType?: "mintra.zk.age-threshold/v1";
      minAge?: 18 | 21;
      referenceDate?: string | Date;
      expiresInSeconds?: number;
    }
  | {
      audience: string;
      verifier: string;
      proofType: "mintra.zk.kyc-passed/v1";
      expiresInSeconds?: number;
    }
  | {
      audience: string;
      verifier: string;
      proofType: "mintra.zk.country-membership/v1";
      countryAllowlist?: string[];
      countryBlocklist?: string[];
      expiresInSeconds?: number;
    };

export interface CreatePresentationEnvelopeInput {
  requestEnvelope: PresentationRequestEnvelope;
  presentationJson: string;
  holderBinding: HolderBinding;
  passkeyBinding?: PasskeyAssertion;
  proofMetadata?: {
    claimModelVersion?: ClaimModelVersion;
    derivedClaims?: DerivedClaims;
    credentialTrust?: CredentialTrust;
    commitmentReferences?: string[];
    derivedFromCommittedSource?: boolean;
  };
  metadata?: {
    walletProvider?: string;
    clientVersion?: string;
  };
}

export interface HolderBindingVerifierAdapter {
  verifyMessage(input: {
    publicKey: string;
    data: string;
    signature: { field: string; scalar: string };
  }): boolean | Promise<boolean>;
}

export interface VerifyHolderBindingParams {
  envelope: PresentationEnvelope;
  ownerPublicKey: string;
  verifier: HolderBindingVerifierAdapter;
  passkeyVerifier?: PasskeyBindingVerifierAdapter;
  expectedPasskeyAuthentication?: PasskeyAuthenticationRequest | null;
}

export interface VerifyAudienceParams {
  challenge: PresentationChallenge;
  expectedAudience: string;
}

export interface VerifyFreshnessParams {
  issuedAt: number;
  maxAgeDays: number | null;
  now?: number;
}

export interface VerifyDerivedClaimParams {
  claim: DerivedClaim | undefined;
  expectedValue?: string | number | boolean | undefined;
}

export interface VerifyCommitmentRelationParams {
  claimKey: string;
  commitmentKey: string;
}

export interface VerifyCredentialTrustParams {
  credentialTrust: CredentialTrust | undefined;
  allowDemoCredentials?: boolean;
  minimumAssuranceLevel?: AssuranceLevel;
  allowedEvidenceClasses?: EvidenceClass[];
}

export interface VerifyMintraPresentationParams {
  envelope: PresentationEnvelope;
  verifierIdentity: string;
  expectedAudience?: string;
  expectedOwnerPublicKey?: string;
  holderBindingVerifier?: HolderBindingVerifierAdapter;
  passkeyBindingVerifier?: PasskeyBindingVerifierAdapter;
  expectedPasskeyAuthentication?: PasskeyAuthenticationRequest | null;
  allowDemoCredentials?: boolean;
  minimumCredentialAssuranceLevel?: AssuranceLevel;
  allowedEvidenceClasses?: EvidenceClass[];
  now?: number;
}

export interface RegistryTrustLookup {
  address: string;
  graphqlUrl: string;
}

export interface RegistryTrustSnapshot {
  address: string;
  graphqlUrl: string;
  issuerPublicKey: string;
  credentialRoot: string;
  revocationRoot: string;
}

export interface VerifyPresentationWithRegistryParams extends VerifyMintraPresentationParams {
  registry: RegistryTrustLookup;
  claimProofs: Record<string, unknown>;
}

export interface PresentationWithRegistryVerificationResult extends PresentationVerificationResult {
  registryVerified: boolean;
  registry?: RegistryTrustSnapshot;
}

export interface PasskeyBindingRecord extends PasskeyBinding {
  rpId: string;
  origin: string;
}

export interface PasskeyBindingVerifierAdapter {
  getBindingById(bindingId: string): Promise<PasskeyBindingRecord | null> | PasskeyBindingRecord | null;
  updateBindingCounter(bindingId: string, counter: number): Promise<void> | void;
}

export interface VerifyPasskeyBindingParams {
  envelope: PresentationEnvelope;
  ownerPublicKey: string;
  expectedAuthentication: PasskeyAuthenticationRequest | null;
  verifier: PasskeyBindingVerifierAdapter;
}

const PROOF_PRODUCTS: Record<ProofProductId, ProofProduct & { defaultPolicy: NormalizedVerifierPolicy }> = {
  proof_of_age_18: {
    id: "proof_of_age_18",
    displayName: "Proof of Age 18+",
    description: "Selective proof that the holder is at least 18 and passed KYC.",
    requestedClaims: ["age_over_18", "kyc_passed", "country_code", "issued_at"],
    verificationRequirements: [
      "age_over_18 must be true",
      "kyc_passed must be true",
      "credential must satisfy freshness rules if configured",
    ],
    outputFields: ["ageOver18", "kycPassed", "countryCodeNumeric", "issuedAt", "ownerPublicKey"],
    defaultPolicy: {
      minAge: 18,
      requireKycPassed: true,
      countryAllowlist: [],
      countryBlocklist: [],
      maxCredentialAgeDays: 365,
    },
  },
  proof_of_kyc_passed: {
    id: "proof_of_kyc_passed",
    displayName: "Proof of KYC Passed",
    description: "Selective proof that the holder completed KYC without disclosing extra identity data.",
    requestedClaims: ["kyc_passed", "issued_at"],
    verificationRequirements: [
      "kyc_passed must be true",
      "credential must satisfy freshness rules if configured",
    ],
    outputFields: ["kycPassed", "issuedAt", "ownerPublicKey"],
    defaultPolicy: {
      minAge: null,
      requireKycPassed: true,
      countryAllowlist: [],
      countryBlocklist: [],
      maxCredentialAgeDays: 365,
    },
  },
  proof_of_country_code: {
    id: "proof_of_country_code",
    displayName: "Proof of Country Code",
    description: "Selective proof for country policy checks such as allow lists and block lists.",
    requestedClaims: ["country_code", "kyc_passed", "issued_at"],
    verificationRequirements: [
      "country policy must pass",
      "credential must satisfy freshness rules if configured",
      "kyc_passed can be required by policy",
    ],
    outputFields: ["countryCodeNumeric", "kycPassed", "issuedAt", "ownerPublicKey"],
    defaultPolicy: {
      minAge: null,
      requireKycPassed: true,
      countryAllowlist: [],
      countryBlocklist: [],
      maxCredentialAgeDays: 365,
    },
  },
};

export function warmUpPresentationTools() {
  void loadPresentationTools();
}

async function loadPresentationTools() {
  cachedPresentationTools ??= Promise.all([
    import("mina-attestations"),
    import("o1js"),
  ]).then(([attestations, o1js]) => ({
    Credential: attestations.Credential,
    Operation: attestations.Operation,
    Presentation: attestations.Presentation,
    PresentationRequest: attestations.PresentationRequest,
    PresentationSpec: attestations.PresentationSpec,
    Field: o1js.Field,
  }));

  return cachedPresentationTools;
}

export function listProofProducts(): ProofProduct[] {
  return Object.values(PROOF_PRODUCTS).map(({ defaultPolicy: _defaultPolicy, ...product }) => product);
}

export function getProofProduct(proofProductId: ProofProductId): ProofProduct {
  const { defaultPolicy: _defaultPolicy, ...product } = PROOF_PRODUCTS[proofProductId];
  return product;
}

export function normalizeVerifierPolicy(policy?: VerifierPolicy): NormalizedVerifierPolicy {
  const minAge = policy?.minAge === 21 ? 21 : policy?.minAge === 18 ? 18 : null;
  const requireKycPassed = policy?.requireKycPassed !== false;
  const countryAllowlist = normalizeCountryList(policy?.countryAllowlist);
  const countryBlocklist = normalizeCountryList(policy?.countryBlocklist);
  const maxCredentialAgeDays = normalizeMaxCredentialAgeDays(policy?.maxCredentialAgeDays);

  return {
    minAge,
    requireKycPassed,
    countryAllowlist,
    countryBlocklist,
    maxCredentialAgeDays,
  };
}

export function resolveProofProductPolicy(
  proofProductId: ProofProductId,
  overrides?: VerifierPolicy
): NormalizedVerifierPolicy {
  const basePolicy = PROOF_PRODUCTS[proofProductId].defaultPolicy;
  return normalizeVerifierPolicy({
    minAge: overrides?.minAge === undefined ? basePolicy.minAge : overrides.minAge,
    requireKycPassed:
      overrides?.requireKycPassed === undefined
        ? basePolicy.requireKycPassed
        : overrides.requireKycPassed,
    countryAllowlist:
      overrides?.countryAllowlist === undefined
        ? basePolicy.countryAllowlist
        : overrides.countryAllowlist,
    countryBlocklist:
      overrides?.countryBlocklist === undefined
        ? basePolicy.countryBlocklist
        : overrides.countryBlocklist,
    maxCredentialAgeDays:
      overrides?.maxCredentialAgeDays === undefined
        ? basePolicy.maxCredentialAgeDays
        : overrides.maxCredentialAgeDays,
  });
}

export async function buildPresentationRequest(
  policy?: VerifierPolicy,
  action = DEFAULT_AGE_PROOF_ACTION
): Promise<AgeOver18PresentationRequest> {
  const {
    Credential,
    Operation,
    PresentationRequest,
    PresentationSpec,
    Field,
  } = await loadPresentationTools();

  const normalizedPolicy = normalizeVerifierPolicy(policy);
  const credentialShape: Record<string, typeof Field> = {
    ageOver18: Field,
    ageOver21: Field,
    kycPassed: Field,
    countryCode: Field,
    nationalityCode: Field,
    documentExpiresAt: Field,
    isDemoCredential: Field,
    credentialMode: Field,
    assuranceLevel: Field,
    evidenceClass: Field,
    issuedAt: Field,
  };
  const credential = Credential.Native(credentialShape);

  const spec = PresentationSpec(
    { credential },
    ({ credential }: { credential: any }) => {
      const assertions = [];

      if (normalizedPolicy.minAge === 21) {
        assertions.push(
          Operation.equals(
            Operation.property(credential, "ageOver21"),
            Operation.constant(Field(1))
          )
        );
      } else if (normalizedPolicy.minAge === 18) {
        assertions.push(
          Operation.equals(
            Operation.property(credential, "ageOver18"),
            Operation.constant(Field(1))
          )
        );
      }

      if (normalizedPolicy.requireKycPassed) {
        assertions.push(
          Operation.equals(
            Operation.property(credential, "kycPassed"),
            Operation.constant(Field(1))
          )
        );
      }

      if (normalizedPolicy.countryAllowlist.length > 0) {
        assertions.push(
          Operation.equalsOneOf(
            Operation.property(credential, "countryCode"),
            normalizedPolicy.countryAllowlist.map((code) =>
              Operation.constant(Field(alpha2ToNumeric(code)))
            )
          )
        );
      }

      if (normalizedPolicy.countryBlocklist.length > 0) {
        assertions.push(
          Operation.not(
            Operation.equalsOneOf(
              Operation.property(credential, "countryCode"),
              normalizedPolicy.countryBlocklist.map((code) =>
                Operation.constant(Field(alpha2ToNumeric(code)))
              )
            )
          )
        );
      }

      if (normalizedPolicy.maxCredentialAgeDays !== null) {
        const minIssuedAt =
          Math.floor(Date.now() / 1000) - normalizedPolicy.maxCredentialAgeDays * 24 * 60 * 60;
        assertions.push(
          Operation.lessThanEq(
            Operation.constant(Field(minIssuedAt)),
            Operation.property(credential, "issuedAt")
          )
        );
      }

      return {
        assert: assertions,
        outputClaim: Operation.record({
          ageOver18: Operation.property(credential, "ageOver18"),
          ageOver21: Operation.property(credential, "ageOver21"),
          kycPassed: Operation.property(credential, "kycPassed"),
          countryCode: Operation.property(credential, "countryCode"),
          nationalityCode: Operation.property(credential, "nationalityCode"),
          documentExpiresAt: Operation.property(credential, "documentExpiresAt"),
          isDemoCredential: Operation.property(credential, "isDemoCredential"),
          credentialMode: Operation.property(credential, "credentialMode"),
          assuranceLevel: Operation.property(credential, "assuranceLevel"),
          evidenceClass: Operation.property(credential, "evidenceClass"),
          issuedAt: Operation.property(credential, "issuedAt"),
          owner: Operation.owner,
        }),
      };
    }
  );

  return PresentationRequest.https(spec, {}, { action }) as AgeOver18PresentationRequest;
}

export async function buildAgeOver18PresentationRequest(
  action = DEFAULT_AGE_PROOF_ACTION
): Promise<AgeOver18PresentationRequest> {
  return buildPresentationRequest(
    {
      minAge: 18,
      requireKycPassed: true,
      maxCredentialAgeDays: 365,
    },
    action
  );
}

export async function createPresentationRequest(
  options: CreatePresentationRequestOptions
): Promise<PresentationRequestEnvelope> {
  const proofProductId = options.proofProductId ?? "proof_of_age_18";
  const product = getProofProduct(proofProductId);
  const normalizedPolicy = resolveProofProductPolicy(proofProductId, options.policy);
  const action = options.action ?? DEFAULT_AGE_PROOF_ACTION;
  const request = await buildPresentationRequest(normalizedPolicy, action);
  const presentationRequest = await serializePresentationRequest(request);
  const presentationRequestJson = JSON.stringify(presentationRequest);
  const issuedAtDate = new Date();
  const expiresAtDate = new Date(
    issuedAtDate.getTime() + (options.expiresInSeconds ?? DEFAULT_PRESENTATION_TTL_SECONDS) * 1000
  );
  const challengeId = globalThis.crypto.randomUUID();
  const nonce = randomHex(16);
  const claimRequestRef = await sha256Hex(presentationRequestJson);

  return PresentationRequestEnvelopeSchema.parse({
    version: "mintra.presentation-request/v1",
    proofProduct: product,
    challenge: {
      version: "mintra.challenge/v1",
      challengeId,
      nonce,
      verifier: options.verifier,
      audience: options.audience,
      action,
      proofProductId,
      claimRequestRef,
      issuedAt: issuedAtDate.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      policy: normalizedPolicy,
      replayProtection: {
        challengeId,
        nonce,
        singleUse: true,
        expiresAt: expiresAtDate.toISOString(),
      },
      holderBindingContext: {
        walletAddress: options.walletAddress ?? null,
        subjectId: options.subjectId ?? options.walletAddress ?? "anonymous-subject",
        requiredMethods: options.requirePasskeyBinding ? ["wallet", "passkey"] : ["wallet"],
      },
    },
    presentationRequest,
    presentationRequestJson,
    holderBindingFormat: "mina:signMessage",
  });
}

export function createZkPolicyRequest(
  options: CreateZkPolicyRequestOptions
): ZkPolicyRequest {
  const issuedAtDate = new Date();
  const expiresAtDate = new Date(
    issuedAtDate.getTime() + (options.expiresInSeconds ?? DEFAULT_ZK_POLICY_TTL_SECONDS) * 1000
  );
  const challenge = {
    challengeId: globalThis.crypto.randomUUID(),
    nonce: randomHex(16),
    issuedAt: issuedAtDate.toISOString(),
    expiresAt: expiresAtDate.toISOString(),
  };

  if (options.proofType === "mintra.zk.kyc-passed/v1") {
    return ZkKycPassedPolicyRequestSchema.parse({
      version: "mintra.zk-policy/v1",
      proofType: "mintra.zk.kyc-passed/v1",
      verifier: options.verifier,
      audience: options.audience,
      challenge,
      requirements: {
        kycPassed: true,
      },
      publicInputs: {
        commitmentKey: "kyc_passed_poseidon_commitment",
      },
      metadata: {
        proofProductId: "proof_of_kyc_passed",
        credentialModel: "mintra.credential-v2",
      },
    });
  }

  if (options.proofType === "mintra.zk.country-membership/v1") {
    const countryAllowlist = normalizeCountryList(options.countryAllowlist);
    const countryBlocklist = normalizeCountryList(options.countryBlocklist);
    if (countryAllowlist.length === 0 && countryBlocklist.length === 0) {
      throw new Error("Country membership proof requires at least one allowlist or blocklist entry");
    }

    return ZkCountryMembershipPolicyRequestSchema.parse({
      version: "mintra.zk-policy/v1",
      proofType: "mintra.zk.country-membership/v1",
      verifier: options.verifier,
      audience: options.audience,
      challenge,
      requirements: {
        countryAllowlist,
        countryBlocklist,
      },
      publicInputs: {
        commitmentKey: "country_code_poseidon_commitment",
        allowlistNumeric: countryAllowlist.map(alpha2ToNumeric).filter((value) => value > 0),
        blocklistNumeric: countryBlocklist.map(alpha2ToNumeric).filter((value) => value > 0),
      },
      metadata: {
        proofProductId: "proof_of_country_code",
        credentialModel: "mintra.credential-v2",
      },
    });
  }

  const referenceDate = normalizeReferenceDateInput(options.referenceDate);

  return ZkAgeThresholdPolicyRequestSchema.parse({
    version: "mintra.zk-policy/v1",
    proofType: "mintra.zk.age-threshold/v1",
    verifier: options.verifier,
    audience: options.audience,
    challenge,
    requirements: {
      ageGte: options.minAge ?? 18,
    },
    publicInputs: {
      referenceDate,
      commitmentKey: "dob_poseidon_commitment",
    },
    metadata: {
      proofProductId: "proof_of_age_18",
      credentialModel: "mintra.credential-v2",
    },
  });
}

export async function buildHolderBindingMessage(
  challenge: PresentationChallenge,
  presentationJson: string,
  ownerPublicKey: string
): Promise<string> {
  const proofHash = await computeProofSha256(presentationJson);
  return [
    "Mintra proof presentation",
    "",
    "Sign this message to bind the proof to this wallet and verifier challenge.",
    "This does not submit a Mina transaction.",
    "",
    `challenge_id: ${challenge.challengeId}`,
    `nonce: ${challenge.nonce}`,
    `audience: ${challenge.audience}`,
    `verifier: ${challenge.verifier}`,
    `action: ${challenge.action}`,
    `owner: ${ownerPublicKey}`,
    `proof_sha256: ${proofHash}`,
    `issued_at: ${challenge.issuedAt}`,
    `expires_at: ${challenge.expiresAt}`,
  ].join("\n");
}

export async function computeProofSha256(presentationJson: string): Promise<string> {
  return sha256Hex(presentationJson);
}

export async function buildPasskeySignedPayload(params: {
  challenge: PresentationChallenge;
  presentationJson: string;
  ownerPublicKey: string;
}): Promise<PasskeyAuthenticationRequest["signedPayload"]> {
  return PasskeySignedPayloadSchema.parse({
    challengeId: params.challenge.challengeId,
    nonce: params.challenge.nonce,
    audience: params.challenge.audience,
    proofSha256: await computeProofSha256(params.presentationJson),
    walletAddress: params.ownerPublicKey,
    subjectId: params.challenge.holderBindingContext.subjectId,
  });
}

export function createPresentationEnvelope(
  input: CreatePresentationEnvelopeInput
): PresentationEnvelope {
  return PresentationEnvelopeSchema.parse({
    version: "mintra.presentation/v1",
    challenge: input.requestEnvelope.challenge,
    proof: {
      format: "mina-attestations/auro",
      presentationJson: input.presentationJson,
      presentationRequestJson: input.requestEnvelope.presentationRequestJson,
      ...(input.proofMetadata?.claimModelVersion === undefined
        ? {}
        : { claimModelVersion: input.proofMetadata.claimModelVersion }),
      ...(input.proofMetadata?.derivedClaims === undefined
        ? {}
        : { derivedClaims: input.proofMetadata.derivedClaims }),
      ...(input.proofMetadata?.credentialTrust === undefined
        ? {}
        : { credentialTrust: input.proofMetadata.credentialTrust }),
      ...(input.proofMetadata?.commitmentReferences === undefined
        ? {}
        : { commitmentReferences: input.proofMetadata.commitmentReferences }),
      ...(input.proofMetadata?.derivedFromCommittedSource === undefined
        ? {}
        : { derivedFromCommittedSource: input.proofMetadata.derivedFromCommittedSource }),
    },
    holderBinding: input.holderBinding,
    ...(input.passkeyBinding === undefined ? {} : { passkeyBinding: input.passkeyBinding }),
    metadata: {
      walletProvider: input.metadata?.walletProvider,
      clientVersion: input.metadata?.clientVersion,
      submittedAt: new Date().toISOString(),
    },
  });
}

export function verifyDerivedClaim(params: VerifyDerivedClaimParams) {
  if (!params.claim) {
    return {
      verified: false,
      reason: "Derived claim is missing",
    };
  }

  if (params.expectedValue === undefined) {
    return {
      verified: true,
    };
  }

  return {
    verified: params.claim.value === params.expectedValue,
    ...(params.claim.value === params.expectedValue
      ? {}
      : { reason: `Derived claim did not match expected value for ${params.claim.key}` }),
  };
}

export function verifyCommitmentRelation(_params: VerifyCommitmentRelationParams) {
  return {
    verified: false,
    reason: "Commitment relation verification is a future zk integration hook and is not enforced yet",
  };
}

export function verifyCredentialTrust(params: VerifyCredentialTrustParams) {
  if (!params.credentialTrust) {
    return {
      verified: true,
      reason: "Credential trust metadata was not provided",
    };
  }

  if (params.allowDemoCredentials !== true && params.credentialTrust.demoCredential) {
    return {
      verified: false,
      reason: "Demo credentials are not allowed for this verifier",
      code: "demo_credential_not_allowed",
    };
  }

  if (
    params.allowedEvidenceClasses &&
    !params.allowedEvidenceClasses.includes(params.credentialTrust.evidenceClass)
  ) {
    return {
      verified: false,
      reason: `Credential evidence class ${params.credentialTrust.evidenceClass} is not allowed`,
      code: "credential_evidence_class_not_allowed",
    };
  }

  if (params.minimumAssuranceLevel) {
    const actual = rankAssuranceLevel(params.credentialTrust.assuranceLevel);
    const minimum = rankAssuranceLevel(params.minimumAssuranceLevel);
    if (actual < minimum) {
      return {
        verified: false,
        reason: `Credential assurance level ${params.credentialTrust.assuranceLevel} is below ${params.minimumAssuranceLevel}`,
        code: "credential_assurance_too_low",
      };
    }
  }

  return {
    verified: true,
  };
}

export async function serializePresentationRequest(
  request: AgeOver18PresentationRequest
): Promise<SerializedPresentationRequest> {
  const { PresentationRequest } = await loadPresentationTools();
  return JSON.parse(PresentationRequest.toJSON(request as any)) as SerializedPresentationRequest;
}

export async function parsePresentationRequest(
  presentationRequestJson: string
): Promise<AgeOver18PresentationRequest> {
  const { PresentationRequest } = await loadPresentationTools();
  return PresentationRequest.fromJSON("https", presentationRequestJson) as AgeOver18PresentationRequest;
}

/** @deprecated Use parsePresentationRequest */
export const parseHttpsPresentationRequest = parsePresentationRequest;

export async function verifyPresentationPolicy(
  params: VerifyPresentationParams
): Promise<VerifiedPresentationOutput> {
  const { Presentation } = await loadPresentationTools();
  const presentation = Presentation.fromJSON(params.presentationJson);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const verified = await (Presentation.verify as any)(params.request, presentation, {
    verifierIdentity: params.verifierIdentity,
  });

  return {
    ageOver18: verified.ageOver18.toString() === "1",
    ageOver21: verified.ageOver21.toString() === "1",
    kycPassed: verified.kycPassed.toString() === "1",
    countryCodeNumeric: Number(verified.countryCode.toString()),
    nationalityCodeNumeric: Number(verified.nationalityCode.toString()),
    documentExpiresAt: Number(verified.documentExpiresAt.toString()),
    isDemoCredential: verified.isDemoCredential.toString() === "1",
    credentialMode: Number(verified.credentialMode.toString()),
    assuranceLevel: Number(verified.assuranceLevel.toString()),
    evidenceClass: Number(verified.evidenceClass.toString()),
    issuedAt: Number(verified.issuedAt.toString()),
    ownerPublicKey: verified.owner.toBase58(),
  };
}

export function verifyAudience(params: VerifyAudienceParams) {
  return {
    verified: params.challenge.audience === params.expectedAudience,
    expected: params.expectedAudience,
    actual: params.challenge.audience,
  };
}

export function verifyFreshness(params: VerifyFreshnessParams) {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const credentialAgeSeconds = Math.max(0, now - params.issuedAt);
  return {
    verified:
      params.maxAgeDays === null ? true : credentialAgeSeconds <= params.maxAgeDays * 24 * 60 * 60,
    issuedAt: params.issuedAt,
    credentialAgeSeconds,
    maxAgeDays: params.maxAgeDays,
  };
}

export async function verifyPasskeyBinding(
  params: VerifyPasskeyBindingParams
): Promise<HolderBindingVerification> {
  const context = params.envelope.challenge.holderBindingContext;
  const requiresPasskey = context.requiredMethods.includes("passkey");
  const assertion = params.envelope.passkeyBinding;
  const expectedAuthentication = params.expectedAuthentication;

  if (!assertion) {
    return requiresPasskey
      ? {
          verified: false,
          walletVerified: true,
          passkeyVerified: false,
          errorCode: "passkey_missing",
          reason: "Passkey assertion is required for this presentation",
        }
      : {
          verified: true,
          walletVerified: true,
          passkeyVerified: false,
      };
  }

  if (!expectedAuthentication) {
    return {
      verified: false,
      walletVerified: true,
      passkeyVerified: false,
      errorCode: "passkey_not_registered",
      reason: "Passkey authentication context was not issued for this challenge",
    };
  }

  const binding = await params.verifier.getBindingById(assertion.bindingId);
  if (!binding) {
    return {
      verified: false,
      walletVerified: true,
      passkeyVerified: false,
      errorCode: "passkey_not_registered",
      reason: "Passkey binding is not registered for this verifier",
    };
  }

  if (
    binding.walletAddress !== params.ownerPublicKey ||
    binding.subjectId !== context.subjectId ||
    assertion.bindingId !== binding.bindingId ||
    assertion.credentialId !== binding.credentialId ||
    expectedAuthentication.bindingId !== binding.bindingId
  ) {
    return {
      verified: false,
      walletVerified: true,
      passkeyVerified: false,
      errorCode: "passkey_mismatch",
      reason: "Passkey binding does not match the proof owner or subject",
    };
  }

  if (!params.envelope.challenge.holderBindingContext.walletAddress) {
    return {
      verified: false,
      walletVerified: true,
      passkeyVerified: false,
      errorCode: "passkey_mismatch",
      reason: "Passkey binding requires a wallet-bound holder binding context",
    };
  }

  const expectedPayload = await buildPasskeySignedPayload({
    challenge: params.envelope.challenge,
    presentationJson: params.envelope.proof.presentationJson,
    ownerPublicKey: params.ownerPublicKey,
  });

  if (
    assertion.challenge !== expectedAuthentication.challenge ||
    JSON.stringify(assertion.signedPayload) !== JSON.stringify(expectedPayload) ||
    JSON.stringify(expectedAuthentication.signedPayload) !== JSON.stringify(expectedPayload)
  ) {
    return {
      verified: false,
      walletVerified: true,
      passkeyVerified: false,
      errorCode: "passkey_mismatch",
      reason: "Passkey signed payload does not match this challenge or proof",
    };
  }

  const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
  const authenticationResponse = {
    id: assertion.credential.id,
    rawId: assertion.credential.rawId,
    type: assertion.credential.type,
    clientExtensionResults: assertion.credential.clientExtensionResults ?? {},
    response: {
      authenticatorData: assertion.credential.response.authenticatorData,
      clientDataJSON: assertion.credential.response.clientDataJSON,
      signature: assertion.credential.response.signature,
      ...(assertion.credential.response.userHandle == null
        ? {}
        : { userHandle: assertion.credential.response.userHandle }),
    },
  };
  const verification = await verifyAuthenticationResponse({
    response: authenticationResponse,
    expectedChallenge: assertion.challenge,
    expectedOrigin: binding.origin,
    expectedRPID: binding.rpId,
    requireUserVerification: true,
    authenticator: {
      credentialID: binding.credentialId,
      credentialPublicKey: base64UrlToBytes(binding.publicKey),
      counter: binding.counter,
      transports: binding.transports as never,
    },
  });

  if (!verification.verified) {
    return {
      verified: false,
      walletVerified: true,
      passkeyVerified: false,
      errorCode: "passkey_invalid_signature",
      reason: "Passkey assertion signature verification failed",
    };
  }

  await params.verifier.updateBindingCounter(
    binding.bindingId,
    verification.authenticationInfo.newCounter
  );

  return {
    verified: true,
    walletVerified: true,
    passkeyVerified: true,
  };
}

export async function verifyHolderBinding(
  params: VerifyHolderBindingParams
): Promise<HolderBindingVerification> {
  const holderBinding = params.envelope.holderBinding;

  if (holderBinding.publicKey !== params.ownerPublicKey) {
    return {
      verified: false,
      walletVerified: false,
      passkeyVerified: false,
      reason: "Holder binding key does not match the proof owner",
    };
  }

  const expectedMessage = await buildHolderBindingMessage(
    params.envelope.challenge,
    params.envelope.proof.presentationJson,
    params.ownerPublicKey
  );

  if (holderBinding.message !== expectedMessage) {
    return {
      verified: false,
      walletVerified: false,
      passkeyVerified: false,
      reason: "Holder binding message does not match the verifier challenge",
    };
  }

  const signatureVerified = await params.verifier.verifyMessage({
    publicKey: holderBinding.publicKey,
    data: holderBinding.message,
    signature: holderBinding.signature,
  });

  if (!signatureVerified) {
    return {
      verified: false,
      walletVerified: false,
      passkeyVerified: false,
      reason: "Wallet signature verification failed",
    };
  }

  if (!params.passkeyVerifier) {
    return params.envelope.challenge.holderBindingContext.requiredMethods.includes("passkey")
      ? {
          verified: false,
          walletVerified: true,
          passkeyVerified: false,
          errorCode: "passkey_missing",
          reason: "Passkey verifier is not configured for a passkey-required challenge",
        }
      : { verified: true, walletVerified: true, passkeyVerified: false };
  }

  return verifyPasskeyBinding({
    envelope: params.envelope,
    ownerPublicKey: params.ownerPublicKey,
    expectedAuthentication: params.expectedPasskeyAuthentication ?? null,
    verifier: params.passkeyVerifier,
  });
}

export async function verifyPresentation(
  params: VerifyMintraPresentationParams
): Promise<PresentationVerificationResult> {
  const verifiedAt = new Date().toISOString();
  const envelope = PresentationEnvelopeSchema.parse(params.envelope);
  const audience = verifyAudience({
    challenge: envelope.challenge,
    expectedAudience: params.expectedAudience ?? params.verifierIdentity,
  });

  if (!audience.verified) {
    return {
      ok: false,
      challenge: {
        challengeId: envelope.challenge.challengeId,
        proofProductId: envelope.challenge.proofProductId,
        audience: envelope.challenge.audience,
      },
      holderBinding: { verified: false, reason: "Presentation rejected before holder binding" },
      audience,
      error: {
        code: "audience_mismatch",
        message: "Presentation audience does not match this verifier",
      },
      verifiedAt,
    };
  }

  let proofOutput: VerifiedPresentationOutput;
  try {
    const request = await parsePresentationRequest(envelope.proof.presentationRequestJson);
    proofOutput = await verifyPresentationPolicy({
      request,
      presentationJson: envelope.proof.presentationJson,
      verifierIdentity: params.verifierIdentity,
    });
  } catch (error) {
    return {
      ok: false,
      challenge: {
        challengeId: envelope.challenge.challengeId,
        proofProductId: envelope.challenge.proofProductId,
        audience: envelope.challenge.audience,
      },
      holderBinding: { verified: false, reason: "Presentation proof did not verify" },
      audience,
      error: {
        code: "invalid_proof",
        message: "Proof verification failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      verifiedAt,
    };
  }

  if (params.expectedOwnerPublicKey && proofOutput.ownerPublicKey !== params.expectedOwnerPublicKey) {
    return {
      ok: false,
      challenge: {
        challengeId: envelope.challenge.challengeId,
        proofProductId: envelope.challenge.proofProductId,
        audience: envelope.challenge.audience,
      },
      ownerPublicKey: proofOutput.ownerPublicKey,
      holderBinding: { verified: false, reason: "Presentation owner did not match expectation" },
      audience,
      error: {
        code: "owner_mismatch",
        message: "Presentation owner does not match the expected wallet",
      },
      verifiedAt,
    };
  }

  if (envelope.proof.derivedClaims) {
    const proofProductId = envelope.challenge.proofProductId;
    const derivedClaims = envelope.proof.derivedClaims;

    if (proofProductId === "proof_of_age_18") {
      const ageCheck = verifyDerivedClaim({
        claim: derivedClaims["age_over_18"],
        expectedValue: true,
      });
      const kycCheck = verifyDerivedClaim({
        claim: derivedClaims["kyc_passed"],
        expectedValue: envelope.challenge.policy.requireKycPassed ? true : undefined,
      });

      if (!ageCheck.verified || !kycCheck.verified) {
        return {
          ok: false,
          challenge: {
            challengeId: envelope.challenge.challengeId,
            proofProductId: envelope.challenge.proofProductId,
            audience: envelope.challenge.audience,
          },
          ownerPublicKey: proofOutput.ownerPublicKey,
          holderBinding: { verified: false, reason: "Derived claim validation failed before holder binding" },
          audience,
          error: {
            code: "derived_claim_mismatch",
            message: "Derived claims did not satisfy the requested policy",
            detail: ageCheck.reason ?? kycCheck.reason,
          },
          verifiedAt,
        };
      }
    }

    if (proofProductId === "proof_of_kyc_passed") {
      const kycCheck = verifyDerivedClaim({
        claim: derivedClaims["kyc_passed"],
        expectedValue: true,
      });
      if (!kycCheck.verified) {
        return {
          ok: false,
          challenge: {
            challengeId: envelope.challenge.challengeId,
            proofProductId: envelope.challenge.proofProductId,
            audience: envelope.challenge.audience,
          },
          ownerPublicKey: proofOutput.ownerPublicKey,
          holderBinding: { verified: false, reason: "Derived claim validation failed before holder binding" },
          audience,
          error: {
            code: "derived_claim_mismatch",
            message: "Derived claims did not satisfy the requested policy",
            detail: kycCheck.reason,
          },
          verifiedAt,
        };
      }
    }

    if (proofProductId === "proof_of_country_code" && derivedClaims["country_code"]) {
      const countryCheck = verifyDerivedClaim({
        claim: derivedClaims["country_code"],
        expectedValue: normalizeCountryToIso2(
          numericToAlpha2(proofOutput.countryCodeNumeric.toString()) ?? proofOutput.countryCodeNumeric.toString()
        ) ?? proofOutput.countryCodeNumeric,
      });
      if (!countryCheck.verified) {
        return {
          ok: false,
          challenge: {
            challengeId: envelope.challenge.challengeId,
            proofProductId: envelope.challenge.proofProductId,
            audience: envelope.challenge.audience,
          },
          ownerPublicKey: proofOutput.ownerPublicKey,
          holderBinding: { verified: false, reason: "Derived claim validation failed before holder binding" },
          audience,
          error: {
            code: "derived_claim_mismatch",
            message: "Derived claims did not satisfy the requested policy",
            detail: countryCheck.reason,
          },
          verifiedAt,
        };
      }
    }
  }

  const freshness = verifyFreshness({
    issuedAt: proofOutput.issuedAt,
    maxAgeDays: envelope.challenge.policy.maxCredentialAgeDays,
    ...(params.now === undefined ? {} : { now: params.now }),
  });
  if (!freshness.verified) {
    return {
      ok: false,
      challenge: {
        challengeId: envelope.challenge.challengeId,
        proofProductId: envelope.challenge.proofProductId,
        audience: envelope.challenge.audience,
      },
      ownerPublicKey: proofOutput.ownerPublicKey,
      output: buildVerifierOutput(proofOutput),
      ...(envelope.proof.credentialTrust === undefined
        ? {}
        : { credentialTrust: envelope.proof.credentialTrust }),
      holderBinding: { verified: false, reason: "Freshness check failed before holder binding" },
      audience,
      freshness,
      error: {
        code: "stale_credential",
        message: "Credential freshness requirement was not satisfied",
      },
      verifiedAt,
    };
  }

  const credentialTrust = verifyCredentialTrust({
    credentialTrust: envelope.proof.credentialTrust,
    ...(params.allowDemoCredentials === undefined
      ? {}
      : { allowDemoCredentials: params.allowDemoCredentials }),
    ...(params.minimumCredentialAssuranceLevel === undefined
      ? {}
      : { minimumAssuranceLevel: params.minimumCredentialAssuranceLevel }),
    ...(params.allowedEvidenceClasses === undefined
      ? {}
      : { allowedEvidenceClasses: params.allowedEvidenceClasses }),
  });
  if (!credentialTrust.verified) {
    return {
      ok: false,
      challenge: {
        challengeId: envelope.challenge.challengeId,
        proofProductId: envelope.challenge.proofProductId,
        audience: envelope.challenge.audience,
      },
      ownerPublicKey: proofOutput.ownerPublicKey,
      output: buildVerifierOutput(proofOutput),
      ...(envelope.proof.credentialTrust === undefined
        ? {}
        : { credentialTrust: envelope.proof.credentialTrust }),
      holderBinding: { verified: false, reason: "Credential trust policy failed before holder binding" },
      audience,
      freshness,
      error: {
        code: credentialTrust.code ?? "credential_trust_failed",
        message: "Credential trust policy was not satisfied",
        detail: credentialTrust.reason,
      },
      verifiedAt,
    };
  }

  const holderBinding = params.holderBindingVerifier
    ? await verifyHolderBinding({
        envelope,
        ownerPublicKey: proofOutput.ownerPublicKey,
        verifier: params.holderBindingVerifier,
        ...(params.passkeyBindingVerifier === undefined
          ? {}
          : { passkeyVerifier: params.passkeyBindingVerifier }),
        ...(params.expectedPasskeyAuthentication === undefined
          ? {}
          : { expectedPasskeyAuthentication: params.expectedPasskeyAuthentication }),
      })
    : {
        verified: false,
        reason: "No holder-binding verifier configured",
      };

  if (!holderBinding.verified) {
    return {
      ok: false,
      challenge: {
        challengeId: envelope.challenge.challengeId,
        proofProductId: envelope.challenge.proofProductId,
        audience: envelope.challenge.audience,
      },
      ownerPublicKey: proofOutput.ownerPublicKey,
      output: buildVerifierOutput(proofOutput),
      ...(envelope.proof.credentialTrust === undefined
        ? {}
        : { credentialTrust: envelope.proof.credentialTrust }),
      holderBinding,
      audience,
      freshness,
      error: {
        code: holderBinding.errorCode ?? "holder_binding_failed",
        message: "Holder binding verification failed",
        detail: holderBinding.reason,
      },
      verifiedAt,
    };
  }

  return {
    ok: true,
    challenge: {
      challengeId: envelope.challenge.challengeId,
      proofProductId: envelope.challenge.proofProductId,
      audience: envelope.challenge.audience,
    },
    ownerPublicKey: proofOutput.ownerPublicKey,
    output: buildVerifierOutput(proofOutput),
    ...(envelope.proof.credentialTrust === undefined
      ? {}
      : { credentialTrust: envelope.proof.credentialTrust }),
    holderBinding,
    audience,
    freshness,
    verifiedAt,
  };
}

export async function verifyPresentationWithRegistry(
  params: VerifyPresentationWithRegistryParams
): Promise<PresentationWithRegistryVerificationResult> {
  const presentationResult = await verifyPresentation(params);
  if (!presentationResult.ok) {
    return {
      ...presentationResult,
      registryVerified: false,
    };
  }

  const registry = await loadRegistrySnapshot(params.registry);
  const claimProofs = RegistryClaimProofsSchema.parse(params.claimProofs);
  if (!presentationResult.ownerPublicKey) {
    return {
      ...presentationResult,
      ok: false,
      registryVerified: false,
      registry,
      error: {
        code: "registry_owner_missing",
        message: "Presentation owner public key is missing for registry verification",
      },
    };
  }
  const subjectHash = await hashSubjectToHex(presentationResult.ownerPublicKey);
  const now = params.now ?? Date.now();
  const requiredClaimKeys = requiredRegistryClaimKeysForProofProduct(
    presentationResult.challenge.proofProductId
  );
  if (!presentationResult.output) {
    return {
      ...presentationResult,
      ok: false,
      registryVerified: false,
      registry,
      error: {
        code: "registry_output_missing",
        message: "Presentation output is missing for registry verification",
      },
    };
  }

  for (const claimKey of requiredClaimKeys) {
    const claimProof = claimProofs[claimKey];
    if (!claimProof) {
      return {
        ...presentationResult,
        ok: false,
        registryVerified: false,
        registry,
        error: {
          code: "registry_claim_missing",
          message: `Registry proof for claim '${claimKey}' is required`,
        },
      };
    }

    const proofVerified = await verifyRegistryClaimProof(claimProof);
    if (!proofVerified) {
      return {
        ...presentationResult,
        ok: false,
        registryVerified: false,
        registry,
        error: {
          code: "registry_proof_invalid",
          message: `Registry proof for claim '${claimKey}' is invalid`,
        },
      };
    }

    const attestation = ClaimAttestationSchema.parse(claimProof.attestation);
    if (attestation.subjectHash !== subjectHash) {
      return {
        ...presentationResult,
        ok: false,
        registryVerified: false,
        registry,
        error: {
          code: "registry_subject_mismatch",
          message: `Registry proof for claim '${claimKey}' does not belong to this wallet`,
        },
      };
    }
    if (attestation.issuerPublicKey !== registry.issuerPublicKey) {
      return {
        ...presentationResult,
        ok: false,
        registryVerified: false,
        registry,
        error: {
          code: "registry_issuer_mismatch",
          message: `Registry proof for claim '${claimKey}' was not issued by the trusted registry issuer`,
        },
      };
    }
    if (Date.parse(attestation.expiresAt) < now) {
      return {
        ...presentationResult,
        ok: false,
        registryVerified: false,
        registry,
        error: {
          code: "registry_attestation_expired",
          message: `Registry proof for claim '${claimKey}' is expired`,
        },
      };
    }
    if (claimProof.inclusionProof.root !== registry.credentialRoot) {
      return {
        ...presentationResult,
        ok: false,
        registryVerified: false,
        registry,
        error: {
          code: "registry_root_mismatch",
          message: `Credential root for claim '${claimKey}' does not match the Mina registry`,
        },
      };
    }
    if (claimProof.revocationProof.root !== registry.revocationRoot) {
      return {
        ...presentationResult,
        ok: false,
        registryVerified: false,
        registry,
        error: {
          code: "registry_revocation_root_mismatch",
          message: `Revocation root for claim '${claimKey}' does not match the Mina registry`,
        },
      };
    }

    const expectedValue = expectedRegistryClaimValue(
      presentationResult.challenge.proofProductId,
      claimKey,
      presentationResult.output
    );
    if (expectedValue !== undefined && !valuesMatch(expectedValue, attestation.value)) {
      return {
        ...presentationResult,
        ok: false,
        registryVerified: false,
        registry,
        error: {
          code: "registry_claim_value_mismatch",
          message: `Registry proof for claim '${claimKey}' does not match the verified presentation output`,
        },
      };
    }
  }

  return {
    ...presentationResult,
    registryVerified: true,
    registry,
  };
}

export async function verifyAgeOver18Presentation(
  params: VerifyPresentationParams
): Promise<VerifiedPresentationOutput> {
  return verifyPresentationPolicy(params);
}

function buildVerifierOutput(proofOutput: Omit<VerifiedPresentationOutput, "ownerPublicKey">) {
  return {
    ageOver18: proofOutput.ageOver18,
    ageOver21: proofOutput.ageOver21,
    kycPassed: proofOutput.kycPassed,
    countryCodeNumeric: proofOutput.countryCodeNumeric,
    nationalityCodeNumeric: proofOutput.nationalityCodeNumeric,
    documentExpiresAt: proofOutput.documentExpiresAt,
    isDemoCredential: proofOutput.isDemoCredential,
    credentialMode: proofOutput.credentialMode,
    assuranceLevel: proofOutput.assuranceLevel,
    evidenceClass: proofOutput.evidenceClass,
    issuedAt: proofOutput.issuedAt,
  };
}

function normalizeCountryList(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const seen = new Set<string>();
  for (const value of values) {
    const code = normalizeCountryToIso2(value);
    if (code) seen.add(code);
  }
  return Array.from(seen);
}

async function loadRegistrySnapshot(input: RegistryTrustLookup): Promise<RegistryTrustSnapshot> {
  const response = await fetch(input.graphqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query:
        "query($pk: PublicKey!) { account(publicKey: $pk) { publicKey zkappState } }",
      variables: { pk: input.address },
    }),
  });
  const payload = (await response.json()) as {
    data?: { account?: { publicKey: string; zkappState: string[] } | null };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message ?? `Registry GraphQL request failed with ${response.status}`);
  }

  const account = payload.data?.account;
  if (!account || !Array.isArray(account.zkappState) || account.zkappState.length < 7) {
    throw new Error("Registry account does not expose the expected Mintra state layout");
  }

  const { Field, PublicKey } = await import("o1js");
  const issuerPublicKey = PublicKey.fromFields([
    Field(account.zkappState[0]!),
    Field(account.zkappState[1]!),
  ]).toBase58();

  return {
    address: account.publicKey,
    graphqlUrl: input.graphqlUrl,
    issuerPublicKey,
    credentialRoot: String(account.zkappState[5]),
    revocationRoot: String(account.zkappState[6]),
  };
}

function requiredRegistryClaimKeysForProofProduct(proofProductId: ProofProductId): string[] {
  if (proofProductId === "proof_of_kyc_passed") return ["kyc_passed"];
  if (proofProductId === "proof_of_country_code") return ["country_code"];
  return ["age_over_18"];
}

function expectedRegistryClaimValue(
  proofProductId: ProofProductId,
  claimKey: string,
  output: PresentationVerificationOutput
): string | number | boolean | undefined {
  if (claimKey === "age_over_18" && proofProductId === "proof_of_age_18") {
    return output.ageOver18;
  }
  if (claimKey === "kyc_passed") {
    return output.kycPassed;
  }
  if (claimKey === "country_code") {
    return numericToAlpha2(output.countryCodeNumeric.toString()) ?? output.countryCodeNumeric;
  }
  return undefined;
}

function valuesMatch(left: string | number | boolean, right: string | number | boolean): boolean {
  return String(left) === String(right);
}

function normalizeCountryToIso2(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const normalized = trimmed.toUpperCase();
  if (!normalized) return undefined;
  if (normalized.length === 2) return normalized;

  if (/^\d+$/.test(normalized)) {
    const byNumeric = countries.numericToAlpha2(normalized.padStart(3, "0"));
    if (byNumeric) return byNumeric;
  }

  const alpha3 = countries.alpha3ToAlpha2(normalized);
  if (alpha3) return alpha3;

  const byName = countries.getAlpha2Code(trimmed, "en");
  if (byName) return byName;

  return undefined;
}

function alpha2ToNumeric(alpha2: string): number {
  return Number(countries.alpha2ToNumeric(alpha2) ?? 0);
}

function numericToAlpha2(value: string): string | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  return countries.numericToAlpha2(value.padStart(3, "0")) ?? undefined;
}

function normalizeMaxCredentialAgeDays(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  if (normalized <= 0) return null;
  return normalized;
}

function normalizeReferenceDateInput(value: string | Date | undefined): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Expected ISO date in YYYY-MM-DD format, received: ${value}`);
  }
  return trimmed;
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function rankAssuranceLevel(level: AssuranceLevel): number {
  switch (level) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
  }
}
