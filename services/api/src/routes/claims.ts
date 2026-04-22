import type { FastifyPluginAsync } from "fastify";
import { requireWalletAuth } from "../auth";
import { buildClaimFreshness, buildNormalizedClaims } from "../claim-state";

export const claimsRouter: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { userId: string } }>("/:userId", async (request, reply) => {
    const { userId } = request.params;
    const authWallet = requireWalletAuth(request, reply);
    if (!authWallet) return;
    if (authWallet !== userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const claim = await app.store.getClaims(userId);

    let verifiedAt: string | null = null;
    let expiresAt: string | null = null;
    let documentExpiresAt: string | null = null;
    let freshnessStatus: "verified" | "expiring_soon" | "expired" | "unverified" = "unverified";
    let normalizedClaims: Record<string, unknown> = {};
    if (claim) {
      normalizedClaims = buildNormalizedClaims(claim);
      const freshness = buildClaimFreshness(claim);
      verifiedAt = freshness.verifiedAt;
      expiresAt = freshness.expiresAt;
      documentExpiresAt = freshness.documentExpiresAt;
      freshnessStatus = freshness.freshnessStatus;
    }
    app.log.info("claims.read");
    return reply.send({
      userId,
      claims: normalizedClaims,
      ...(claim?.claimModelVersion ? { claimModelVersion: claim.claimModelVersion } : {}),
      ...(claim?.derivedClaims ? { derivedClaims: claim.derivedClaims } : {}),
      ...(claim?.sourceCommitments ? { sourceCommitments: claim.sourceCommitments } : {}),
      ...(claim?.credentialTrust ? { credentialTrust: claim.credentialTrust } : {}),
      ...(claim?.credentialTrust ? { isDemoCredential: claim.credentialTrust.demoCredential } : {}),
      documentExpiresAt,
      verifiedAt,
      expiresAt,
      freshnessStatus,
    });
  });
};
