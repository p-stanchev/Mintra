import type { FastifyPluginAsync } from "fastify";
import { requireWalletAuth } from "../auth";

export const claimsRouter: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { userId: string } }>("/:userId", async (request, reply) => {
    const { userId } = request.params;
    const authWallet = requireWalletAuth(request, reply);
    if (!authWallet) return;
    if (authWallet !== userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const claim = await app.store.getClaims(userId);

    const normalizedClaims: Record<string, unknown> = {};
    if (claim) {
      if (claim.ageOver18 !== null) normalizedClaims["age_over_18"] = claim.ageOver18;
      if (claim.kycPassed !== null) normalizedClaims["kyc_passed"] = claim.kycPassed;
      if (claim.countryCode !== null) normalizedClaims["country_code"] = claim.countryCode;
    }
    app.log.info("claims.read");
    return reply.send({
      userId,
      claims: normalizedClaims,
      verifiedAt: claim?.verifiedAt?.toISOString() ?? null,
    });
  });
};
