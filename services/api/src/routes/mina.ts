import type { FastifyPluginAsync } from "fastify";
import { IssueMinaCredentialRequestSchema } from "@mintra/sdk-types";
import { isValidMinaPublicKey, requireFreshWalletAuth } from "../auth";

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

    const normalizedClaims = {
      ...(claim.ageOver18 !== null ? { age_over_18: claim.ageOver18 } : {}),
      ...(claim.kycPassed !== null ? { kyc_passed: claim.kycPassed } : {}),
      ...(claim.countryCode !== null ? { country_code: claim.countryCode } : {}),
    };

    const result = await app.minaBridge.issueCredential({
      userId,
      claims: normalizedClaims,
      ownerPublicKey,
    });

    app.log.info("mina.credential_issued");
    return reply.send(result);
  });
};
