import type { FastifyPluginAsync } from "fastify";
import { StartVerificationRequestSchema } from "@mintra/sdk-types";

export const verificationsRouter: FastifyPluginAsync = async (app) => {
  app.post("/start", async (request, reply) => {
    let body: { userId: string; redirectUrl?: string };
    try {
      body = StartVerificationRequestSchema.parse(request.body) as typeof body;
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const { userId, redirectUrl } = body;
    const session = await app.diditProvider.createSession({
      userId,
      ...(redirectUrl !== undefined ? { redirectUrl } : {}),
    });

    const record = await app.store.createVerification(userId, session.sessionId);

    return reply.status(201).send({
      sessionId: record.id,
      verificationUrl: session.verificationUrl,
      status: record.status,
    });
  });

  app.get<{ Params: { id: string } }>("/:id/status", async (request, reply) => {
    const { id } = request.params;
    const record = (await app.store.getVerification(id)) ?? (await app.store.getVerificationByProviderRef(id));
    if (!record) {
      return reply.status(404).send({ error: "Verification not found" });
    }

    let normalizedClaims: Record<string, unknown> = {};
    if (record.status === "approved") {
      const claim = await app.store.getClaims(record.userId);
      if (claim) {
        if (claim.ageOver18 !== null) normalizedClaims["age_over_18"] = claim.ageOver18;
        if (claim.kycPassed !== null) normalizedClaims["kyc_passed"] = claim.kycPassed;
        if (claim.countryCode !== null) normalizedClaims["country_code"] = claim.countryCode;
      }
    }

    return reply.send({
      id: record.id,
      userId: record.userId,
      provider: record.provider,
      status: record.status,
      claims: normalizedClaims,
      providerReference: record.providerReference,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  });
};
