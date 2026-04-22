import type { FastifyPluginAsync } from "fastify";
import { requireWalletAuth } from "../auth";

const CLAIM_FRESHNESS_DAYS = Number(process.env["MINTRA_CLAIM_FRESHNESS_DAYS"] ?? 365);
const CLAIM_EXPIRING_SOON_DAYS = Number(process.env["MINTRA_CLAIM_EXPIRING_SOON_DAYS"] ?? 30);

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
    let verifiedAt: string | null = null;
    let expiresAt: string | null = null;
    let freshnessStatus: "verified" | "expiring_soon" | "expired" | "unverified" = "unverified";
    if (claim) {
      if (claim.ageOver18 !== null) normalizedClaims["age_over_18"] = claim.ageOver18;
      if (claim.ageOver21 !== null) normalizedClaims["age_over_21"] = claim.ageOver21;
      if (claim.kycPassed !== null) normalizedClaims["kyc_passed"] = claim.kycPassed;
      if (claim.countryCode !== null) normalizedClaims["country_code"] = claim.countryCode;
      verifiedAt = claim.verifiedAt.toISOString();

      const expiresAtDate = new Date(
        claim.verifiedAt.getTime() + CLAIM_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
      );
      expiresAt = expiresAtDate.toISOString();

      const now = Date.now();
      const expiringSoonAt = expiresAtDate.getTime() - CLAIM_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
      if (now >= expiresAtDate.getTime()) {
        freshnessStatus = "expired";
      } else if (now >= expiringSoonAt) {
        freshnessStatus = "expiring_soon";
      } else {
        freshnessStatus = "verified";
      }
    }
    app.log.info("claims.read");
    return reply.send({
      userId,
      claims: normalizedClaims,
      ...(claim?.claimModelVersion ? { claimModelVersion: claim.claimModelVersion } : {}),
      ...(claim?.derivedClaims ? { derivedClaims: claim.derivedClaims } : {}),
      ...(claim?.sourceCommitments ? { sourceCommitments: claim.sourceCommitments } : {}),
      verifiedAt,
      expiresAt,
      freshnessStatus,
    });
  });
};
