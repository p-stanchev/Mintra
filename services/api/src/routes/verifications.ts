import type { FastifyPluginAsync } from "fastify";
import { StartVerificationRequestSchema } from "@mintra/sdk-types";
import { requireWalletAuth } from "../auth";
import { buildNormalizedClaims } from "../claim-state";

const USER_ID_RE = /^[a-zA-Z0-9_\-.@:]{1,128}$/;

export const verificationsRouter: FastifyPluginAsync = async (app) => {
  app.post("/start", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const authWallet = requireWalletAuth(request, reply);
    if (!authWallet) return;

    let body: { userId: string; providerId?: "didit" | "idnorm"; redirectUrl?: string };
    try {
      body = StartVerificationRequestSchema.parse(request.body) as typeof body;
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const { userId, providerId, redirectUrl } = body;
    if (authWallet !== userId) {
      return reply.status(403).send({ error: "Verification can only be started for the authenticated wallet" });
    }

    if (!USER_ID_RE.test(userId)) {
      return reply.status(400).send({ error: "Invalid userId format" });
    }

    if (redirectUrl !== undefined) {
      const allowed = app.allowedCallbackOrigins;
      const ok = allowed.some((origin) => redirectUrl === origin || redirectUrl.startsWith(origin + "/"));
      if (!ok) {
        return reply.status(400).send({ error: "redirectUrl is not an allowed callback origin" });
      }
    }

    const chosenProviderId = providerId ?? app.defaultVerificationProviderId;
    if (!chosenProviderId) {
      return reply.status(503).send({ error: "No verification provider is configured" });
    }
    const provider = app.verificationProviders[chosenProviderId];
    if (!provider) {
      return reply.status(400).send({ error: `Verification provider '${chosenProviderId}' is not configured` });
    }

    const session = await provider.createSession({
      userId,
      ...(redirectUrl !== undefined ? { redirectUrl } : {}),
    });

    const record = await app.store.createVerification(userId, chosenProviderId, session.sessionId);
    app.log.info({ verificationId: record.id }, "verification.created");

    return reply.status(201).send({
      sessionId: record.id,
      verificationUrl: session.verificationUrl,
      provider: chosenProviderId,
      status: record.status,
    });
  });

  app.get<{ Params: { id: string } }>("/:id/status", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const authWallet = requireWalletAuth(request, reply);
    if (!authWallet) return;

    const { id } = request.params;

    // Only resolve by internal UUID — never expose provider session ID as a lookup key
    const record = await app.store.getVerification(id);
    if (!record) {
      return reply.status(404).send({ error: "Verification not found" });
    }
    if (record.userId !== authWallet) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    let normalizedClaims: Record<string, unknown> = {};
    let claimModelVersion: string | undefined;
    let derivedClaims: unknown;
    let sourceCommitments: unknown;
    let credentialTrust: unknown;
    if (record.status === "approved") {
      const claim = await app.store.getClaims(record.userId);
      if (claim) {
        normalizedClaims = buildNormalizedClaims(claim);
        claimModelVersion = claim.claimModelVersion;
        derivedClaims = claim.derivedClaims;
        sourceCommitments = claim.sourceCommitments;
        credentialTrust = claim.credentialTrust;
      }
    }

    app.log.info({ verificationId: id, status: record.status }, "verification.status_read");

    return reply.send({
      id: record.id,
      userId: record.userId,
      provider: record.provider,
      status: record.status,
      claims: normalizedClaims,
      ...(claimModelVersion ? { claimModelVersion } : {}),
      ...(derivedClaims ? { derivedClaims } : {}),
      ...(sourceCommitments ? { sourceCommitments } : {}),
      ...(credentialTrust ? { credentialTrust } : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  });
};
