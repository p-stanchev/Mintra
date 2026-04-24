import type { FastifyPluginAsync } from "fastify";
import countries from "i18n-iso-countries";
import {
  GetZkProofInputResponseSchema,
  IssueMinaCredentialRequestSchema,
} from "@mintra/sdk-types";
import { isValidMinaPublicKey, requireFreshWalletAuth } from "../auth";
import { buildNormalizedClaims } from "../claim-state";

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

    const credentialMetadata = claim.claimModelVersion === "v2"
      ? {
          version: "v2" as const,
          derivedClaims: claim.derivedClaims ?? {},
          sourceCommitments: claim.sourceCommitments ?? {},
          ...(claim.credentialTrust === undefined ? {} : { credentialTrust: claim.credentialTrust }),
        }
      : null;

    if (!credentialMetadata) {
      return reply.status(409).send({ error: "Credential metadata version v2 is required for zk age proof generation" });
    }

    const countryCodeNumeric = claim.countryCode
      ? Number(countries.alpha2ToNumeric(claim.countryCode) ?? 0)
      : undefined;

    return reply.send(
      GetZkProofInputResponseSchema.parse({
        userId,
        ...(claim.dateOfBirth === undefined ? {} : { dateOfBirth: claim.dateOfBirth }),
        ...(claim.kycPassed === null ? {} : { kycPassed: claim.kycPassed }),
        ...(claim.countryCode === null ? {} : { countryCode: claim.countryCode }),
        ...(countryCodeNumeric && countryCodeNumeric > 0 ? { countryCodeNumeric } : {}),
        credentialMetadata,
      })
    );
  });
};
