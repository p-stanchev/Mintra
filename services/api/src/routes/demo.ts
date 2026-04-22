import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { IssueDemoClaimsRequestSchema } from "@mintra/sdk-types";
import { requireFreshWalletAuth } from "../auth";

const CLAIM_FRESHNESS_DAYS = Number(process.env["MINTRA_CLAIM_FRESHNESS_DAYS"] ?? 365);
const CLAIM_EXPIRING_SOON_DAYS = Number(process.env["MINTRA_CLAIM_EXPIRING_SOON_DAYS"] ?? 30);

export const demoRouter: FastifyPluginAsync = async (app) => {
  app.post("/issue-claims", async (request, reply) => {
    let body: {
      userId: string;
      ageOver18: boolean;
      ageOver21: boolean;
      kycPassed: boolean;
      countryCode?: string;
      nationality?: string;
      documentExpiresAt?: string;
    };

    try {
      body = IssueDemoClaimsRequestSchema.parse(request.body) as typeof body;
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const authWallet = requireFreshWalletAuth(request, reply);
    if (!authWallet) return;

    if (authWallet !== body.userId) {
      return reply.status(403).send({ error: "Demo claims can only be issued for the authenticated wallet" });
    }

    if (body.ageOver21 && !body.ageOver18) {
      return reply.status(400).send({ error: "Invalid request", detail: "ageOver21 requires ageOver18" });
    }

    const countryCode = body.countryCode?.toUpperCase() ?? null;
    const nationality = body.nationality?.toUpperCase() ?? null;
    const documentExpiresAt = body.documentExpiresAt
      ? `${body.documentExpiresAt}T00:00:00.000Z`
      : undefined;
    const credentialTrust = {
      issuerEnvironment: "demo" as const,
      issuerId: "mintra-demo-issuer",
      issuerDisplayName: "Mintra Demo Issuer",
      assuranceLevel: "low" as const,
      evidenceClass: "locally-derived" as const,
      demoCredential: true,
    };

    await app.store.upsertClaims(body.userId, `demo-${randomUUID()}`, {
      ageOver18: body.ageOver18,
      ageOver21: body.ageOver21,
      kycPassed: body.kycPassed,
      ...(countryCode ? { countryCode } : {}),
      ...(nationality ? { nationality } : {}),
      ...(documentExpiresAt ? { documentExpiresAt } : {}),
      claimModelVersion: "v1",
      credentialTrust,
    });

    const verifiedAt = new Date();
    const expiresAtDate = new Date(
      verifiedAt.getTime() + CLAIM_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
    );
    const expiringSoonAt = expiresAtDate.getTime() - CLAIM_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const freshnessStatus =
      now >= expiresAtDate.getTime()
        ? "expired"
        : now >= expiringSoonAt
          ? "expiring_soon"
          : "verified";

    app.log.info({ userId: body.userId }, "demo.claims_issued");
    return reply.send({
      userId: body.userId,
      claims: {
        ...(body.ageOver18 ? { age_over_18: true } : {}),
        ...(body.ageOver21 ? { age_over_21: true } : {}),
        ...(body.kycPassed ? { kyc_passed: true } : {}),
        ...(countryCode ? { country_code: countryCode } : {}),
        ...(nationality ? { nationality } : {}),
        ...(documentExpiresAt ? { document_expires_at: documentExpiresAt } : {}),
      },
      claimModelVersion: "v1",
      credentialTrust,
      isDemoCredential: true,
      documentExpiresAt: documentExpiresAt ?? null,
      verifiedAt: verifiedAt.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      freshnessStatus,
    });
  });
};
