import type { FastifyPluginAsync } from "fastify";
import { IssueMinaCredentialRequestSchema } from "@mintra/sdk-types";

export const minaRouter: FastifyPluginAsync = async (app) => {
  app.post("/issue-credential", async (request, reply) => {
    if (!app.minaBridge) {
      return reply.status(501).send({
        error: "Mina bridge not configured",
        detail: "Set MINA_ISSUER_PRIVATE_KEY to enable credential issuance",
      });
    }

    let body: { userId: string; ownerPublicKey: string };
    try {
      body = IssueMinaCredentialRequestSchema.parse(request.body) as typeof body;
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const { userId, ownerPublicKey } = body;

    const claim = app.store.getClaims(userId);
    if (!claim) {
      return reply.status(403).send({ error: "No approved claims found for user" });
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

    return reply.send(result);
  });
};
