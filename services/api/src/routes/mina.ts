import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import countries from "i18n-iso-countries";
import {
  CreateZkProofRequestSchema,
  CreateZkProofResponseSchema,
  GetZkProofInputResponseSchema,
  IssueMinaCredentialRequestSchema,
  type GetZkProofInputResponse,
  type ZkPolicyRequest,
} from "@mintra/sdk-types";
import {
  proveAgeClaimFromCredentialMetadata,
  proveCountryMembershipFromCredentialMetadata,
  proveKycPassedFromCredentialMetadata,
} from "@mintra/zk-claims";
import { isValidMinaPublicKey, requireFreshWalletAuth } from "../auth";
import { buildNormalizedClaims } from "../claim-state";
import type { ClaimsRecord } from "../store";

export const minaRouter: FastifyPluginAsync = async (app) => {
  app.post("/issue-credential", async (request, reply) => {
    if (!app.minaBridge) {
      return reply.status(501).send({ error: "Mina credential issuance is not enabled" });
    }

    let body: { userId: string; ownerPublicKey: string };
    try {
      body = IssueMinaCredentialRequestSchema.parse(request.body) as typeof body;
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const { userId, ownerPublicKey } = body;
    const authWallet = requireFreshWalletAuth(request, reply);
    if (!authWallet) return;

    if (!isValidMinaPublicKey(ownerPublicKey)) {
      return reply.status(400).send({ error: "Invalid owner public key" });
    }

    if (authWallet !== userId || authWallet !== ownerPublicKey) {
      return reply.status(403).send({ error: "Credential issuance is only allowed for the authenticated wallet" });
    }

    const claim = await app.store.getClaims(userId);
    if (!claim) {
      app.log.warn("mina.issue_denied: no approved claims");
      return reply.status(403).send({ error: "No approved verification found for this user" });
    }

    const normalizedClaims = buildNormalizedClaims(claim);

    const result = await app.minaBridge.issueCredential({
      userId,
      claims: normalizedClaims,
      ownerPublicKey,
      credentialMetadata: claim.claimModelVersion === "v2"
        ? {
            version: "v2",
            derivedClaims: claim.derivedClaims ?? {},
            sourceCommitments: claim.sourceCommitments ?? {},
            ...(claim.credentialTrust === undefined ? {} : { credentialTrust: claim.credentialTrust }),
          }
        : {
            version: "v1",
            claims: normalizedClaims,
            ...(claim.credentialTrust === undefined ? {} : { credentialTrust: claim.credentialTrust }),
          },
    });

    app.log.info("mina.credential_issued");
    return reply.send(result);
  });

  app.get<{ Params: { userId: string } }>("/zk-age-proof-input/:userId", async (request, reply) => {
    const { userId } = request.params;
    const authWallet = requireFreshWalletAuth(request, reply);
    if (!authWallet) return;

    if (!isValidMinaPublicKey(userId)) {
      return reply.status(400).send({ error: "Invalid user public key" });
    }

    if (authWallet !== userId) {
      return reply.status(403).send({ error: "ZK proof input is only available to the authenticated wallet owner" });
    }

    const claim = await app.store.getClaims(userId);
    if (!claim) {
      return reply.status(404).send({ error: "No approved verification found for this user" });
    }

    if (!claim.dateOfBirth) {
      return reply.status(409).send({ error: "This verification record does not include date of birth for age proof generation" });
    }

    const zkInput = buildZkProofInputPayload(app, userId, claim);
    if (!zkInput) {
      return reply.status(409).send({ error: "Credential metadata version v2 is required for zk age proof generation" });
    }

    return reply.send(zkInput);
  });

  app.post("/zk-proof", async (request, reply) => {
    const authWallet = requireFreshWalletAuth(request, reply);
    if (!authWallet) return;

    const parsed = CreateZkProofRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request", detail: parsed.error.message });
    }

    if (!isValidMinaPublicKey(parsed.data.userId)) {
      return reply.status(400).send({ error: "Invalid user public key" });
    }

    if (authWallet !== parsed.data.userId) {
      return reply.status(403).send({
        error: "ZK proof generation is only allowed for the authenticated wallet owner",
      });
    }

    const claim = await app.store.getClaims(parsed.data.userId);
    if (!claim) {
      return reply.status(404).send({ error: "No approved verification found for this user" });
    }

    const zkInput = buildZkProofInputPayload(app, parsed.data.userId, claim);
    if (!zkInput) {
      return reply.status(409).send({ error: "Credential metadata version v2 is required for zk proof generation" });
    }

    try {
      const proof = await createBackendZkProof({
        zkInput,
        request: parsed.data.request,
      });
      return reply.send(CreateZkProofResponseSchema.parse({ proof }));
    } catch (error) {
      app.log.warn({ err: error }, "mina.zk_proof_failed");
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Could not generate zk proof",
      });
    }
  });
};

function buildZkProofInputPayload(
  app: FastifyInstance,
  userId: string,
  claim: ClaimsRecord
): GetZkProofInputResponse | null {
  const credentialMetadata = claim.claimModelVersion === "v2"
    ? {
        version: "v2" as const,
        derivedClaims: claim.derivedClaims ?? {},
        sourceCommitments: claim.sourceCommitments ?? {},
        ...(claim.credentialTrust === undefined ? {} : { credentialTrust: claim.credentialTrust }),
      }
    : null;

  if (!credentialMetadata) {
    return null;
  }

  const countryCodeNumeric = claim.countryCode
    ? Number(countries.alpha2ToNumeric(claim.countryCode) ?? 0)
    : undefined;

  const zkSalts: { dob?: string; kyc?: string; country?: string } = {};
  if (claim.dateOfBirth) {
    zkSalts.dob = app.diditProvider.getZkSalt(userId, "dob").toString(16);
  }
  if (claim.kycPassed === true) {
    zkSalts.kyc = app.diditProvider.getZkSalt(userId, "kyc").toString(16);
  }
  if (claim.countryCode) {
    zkSalts.country = app.diditProvider.getZkSalt(userId, "country").toString(16);
  }

  return GetZkProofInputResponseSchema.parse({
    userId,
    ...(claim.dateOfBirth === undefined ? {} : { dateOfBirth: claim.dateOfBirth }),
    ...(claim.kycPassed === null ? {} : { kycPassed: claim.kycPassed }),
    ...(claim.countryCode === null ? {} : { countryCode: claim.countryCode }),
    ...(countryCodeNumeric && countryCodeNumeric > 0 ? { countryCodeNumeric } : {}),
    credentialMetadata,
    zkSalts,
  });
}

async function createBackendZkProof(input: {
  zkInput: GetZkProofInputResponse;
  request: ZkPolicyRequest;
}) {
  if (input.request.proofType === "mintra.zk.age-threshold/v1") {
    if (!input.zkInput.dateOfBirth) {
      throw new Error("This credential does not include date of birth for age proving.");
    }

    const proof = await proveAgeClaimFromCredentialMetadata({
      credentialMetadata: input.zkInput.credentialMetadata,
      dateOfBirth: input.zkInput.dateOfBirth,
      minAge: input.request.requirements.ageGte,
      referenceDate: input.request.publicInputs.referenceDate,
      ...(input.zkInput.zkSalts?.dob ? { salt: BigInt(`0x${input.zkInput.zkSalts.dob}`) } : {}),
    });
    return proof.toJSON();
  }

  if (input.request.proofType === "mintra.zk.kyc-passed/v1") {
    if (input.zkInput.kycPassed !== true) {
      throw new Error("This credential does not currently satisfy the KYC-passed proof.");
    }

    const proof = await proveKycPassedFromCredentialMetadata({
      credentialMetadata: input.zkInput.credentialMetadata,
      kycPassed: input.zkInput.kycPassed,
      ...(input.zkInput.zkSalts?.kyc ? { salt: BigInt(`0x${input.zkInput.zkSalts.kyc}`) } : {}),
    });
    return proof.toJSON();
  }

  if (!input.zkInput.countryCodeNumeric) {
    throw new Error("This credential does not include a normalized country code for country proofs.");
  }

  const proof = await proveCountryMembershipFromCredentialMetadata({
    credentialMetadata: input.zkInput.credentialMetadata,
    countryCodeNumeric: input.zkInput.countryCodeNumeric,
    allowlistNumeric: input.request.publicInputs.allowlistNumeric,
    blocklistNumeric: input.request.publicInputs.blocklistNumeric,
    ...(input.zkInput.zkSalts?.country ? { salt: BigInt(`0x${input.zkInput.zkSalts.country}`) } : {}),
  });
  return proof.toJSON();
}
