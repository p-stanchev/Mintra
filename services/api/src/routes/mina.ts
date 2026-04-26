import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import countries from "i18n-iso-countries";
import { createRequire } from "node:module";
import {
  canonicalizeZkProofMaterialBundlePayload,
  CreateZkProofRequestSchema,
  CreateZkProofResponseSchema,
  GetZkProofInputResponseSchema,
  IssueMinaCredentialRequestSchema,
  VerifyZkProofMaterialBundleRequestSchema,
  type GetZkProofInputResponse,
  type SignedZkProofMaterialBundle,
  type ZkPolicyRequest,
} from "@mintra/sdk-types";
import { isValidMinaPublicKey, requireFreshWalletAuth } from "../auth";
import { buildNormalizedClaims } from "../claim-state";
import type { ClaimsRecord } from "../store";

const nodeRequire = createRequire(__filename);
const MinaSigner = nodeRequire("mina-signer");

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
    const zkProofMaterial = buildZkProofInputPayload(app, userId, claim);
    const zkProofMaterialBundle = createSignedZkProofMaterialBundle(app, ownerPublicKey, zkProofMaterial);

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
    return reply.send({
      ...result,
      ...(zkProofMaterial === null ? {} : { zkProofMaterial }),
      ...(zkProofMaterialBundle === null ? {} : { zkProofMaterialBundle }),
    });
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

    let bundle: SignedZkProofMaterialBundle | null = null;
    try {
      bundle = parsed.data.proofMaterialBundle
        ? verifySignedZkProofMaterialBundle(app, parsed.data.proofMaterialBundle)
        : null;
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Invalid proof material bundle",
      });
    }
    let zkInput = bundle?.proofMaterial ?? null;
    let proofMaterialBundle = bundle;

    if (!zkInput) {
      const claim = await app.store.getClaims(parsed.data.userId);
      if (!claim) {
        return reply.status(404).send({ error: "No approved verification found for this user" });
      }

      zkInput = buildZkProofInputPayload(app, parsed.data.userId, claim);
      if (!zkInput) {
        return reply.status(409).send({ error: "Credential metadata version v2 is required for zk proof generation" });
      }
      proofMaterialBundle = createSignedZkProofMaterialBundle(app, parsed.data.userId, zkInput);
    }

    if (zkInput.userId !== parsed.data.userId) {
      return reply.status(403).send({
        error: "Proof material bundle does not belong to the authenticated wallet owner",
      });
    }

    try {
      const proof = await createBackendZkProof({
        zkInput,
        request: parsed.data.request,
      });
      return reply.send(
        CreateZkProofResponseSchema.parse({
          proof,
          ...(proofMaterialBundle === null ? {} : { proofMaterialBundle }),
        })
      );
    } catch (error) {
      app.log.warn({ err: error }, "mina.zk_proof_failed");
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Could not generate zk proof",
      });
    }
  });

  app.post("/verify-proof-bundle", async (request, reply) => {
    const authWallet = requireFreshWalletAuth(request, reply);
    if (!authWallet) return;

    const parsed = CreateVerifyProofBundleBody(request.body);
    if (!parsed.ok) {
      return reply.status(400).send({ error: parsed.error });
    }

    let bundle: SignedZkProofMaterialBundle;
    try {
      bundle = verifySignedZkProofMaterialBundle(app, parsed.bundle);
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Invalid proof material bundle",
      });
    }

    if (bundle.walletAddress !== authWallet || bundle.proofMaterial.userId !== authWallet) {
      return reply.status(403).send({
        error: "Proof material bundle does not belong to the authenticated wallet owner",
      });
    }

    return reply.send({
      ok: true,
      walletAddress: bundle.walletAddress,
      issuerPublicKey: bundle.issuerPublicKey,
    });
  });
};

function CreateVerifyProofBundleBody(body: unknown):
  | { ok: true; bundle: SignedZkProofMaterialBundle }
  | { ok: false; error: string } {
  const parsed = VerifyZkProofMaterialBundleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, bundle: parsed.data.bundle };
}

function createSignedZkProofMaterialBundle(
  app: FastifyInstance,
  walletAddress: string,
  proofMaterial: GetZkProofInputResponse | null
): SignedZkProofMaterialBundle | null {
  if (!proofMaterial || !app.minaIssuerPrivateKey || !app.minaIssuerPublicKey) {
    return null;
  }

  const signer = new MinaSigner({ network: "mainnet" });
  const payload = {
    version: "mintra.zk-proof-material/v2" as const,
    walletAddress,
    issuerPublicKey: app.minaIssuerPublicKey,
    issuedAt: new Date().toISOString(),
    proofMaterial,
  };
  const signed = signer.signMessage(
    canonicalizeZkProofMaterialBundlePayload(payload),
    app.minaIssuerPrivateKey
  );

  return {
    ...payload,
    issuerSignature: signed.signature,
  };
}

function verifySignedZkProofMaterialBundle(
  app: FastifyInstance,
  bundle: SignedZkProofMaterialBundle
): SignedZkProofMaterialBundle {
  if (!app.minaIssuerPublicKey) {
    throw new Error("Mintra issuer public key is not configured for signed proof bundles");
  }
  if (bundle.issuerPublicKey !== app.minaIssuerPublicKey) {
    throw new Error("Proof material bundle issuer does not match this Mintra issuer");
  }
  if (bundle.walletAddress !== bundle.proofMaterial.userId) {
    throw new Error("Proof material bundle wallet does not match the embedded proof owner");
  }

  const signer = new MinaSigner({ network: "mainnet" });
  const verified = signer.verifyMessage({
    data: canonicalizeZkProofMaterialBundlePayload({
      version: bundle.version,
      walletAddress: bundle.walletAddress,
      issuerPublicKey: bundle.issuerPublicKey,
      issuedAt: bundle.issuedAt,
      proofMaterial: bundle.proofMaterial,
    }),
    publicKey: bundle.issuerPublicKey,
    signature: bundle.issuerSignature,
  });

  if (!verified) {
    throw new Error("Proof material bundle signature verification failed");
  }

  return bundle;
}

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
  const zkClaims = await import("@mintra/zk-claims");

  if (input.request.proofType === "mintra.zk.age-threshold/v1") {
    if (!input.zkInput.dateOfBirth) {
      throw new Error("This credential does not include date of birth for age proving.");
    }

    const proof = await zkClaims.proveAgeClaimFromCredentialMetadata({
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

    const proof = await zkClaims.proveKycPassedFromCredentialMetadata({
      credentialMetadata: input.zkInput.credentialMetadata,
      kycPassed: input.zkInput.kycPassed,
      ...(input.zkInput.zkSalts?.kyc ? { salt: BigInt(`0x${input.zkInput.zkSalts.kyc}`) } : {}),
    });
    return proof.toJSON();
  }

  if (!input.zkInput.countryCodeNumeric) {
    throw new Error("This credential does not include a normalized country code for country proofs.");
  }

  const proof = await zkClaims.proveCountryMembershipFromCredentialMetadata({
    credentialMetadata: input.zkInput.credentialMetadata,
    countryCodeNumeric: input.zkInput.countryCodeNumeric,
    allowlistNumeric: input.request.publicInputs.allowlistNumeric,
    blocklistNumeric: input.request.publicInputs.blocklistNumeric,
    ...(input.zkInput.zkSalts?.country ? { salt: BigInt(`0x${input.zkInput.zkSalts.country}`) } : {}),
  });
  return proof.toJSON();
}
