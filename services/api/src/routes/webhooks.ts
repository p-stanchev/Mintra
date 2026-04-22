import type { FastifyPluginAsync } from "fastify";

const DIDIT_STATUS_MAP: Record<string, "approved" | "rejected" | "needs_review" | "pending"> = {
  Approved: "approved",
  Declined: "rejected",
  "In Review": "needs_review",
  Abandoned: "rejected",
  "Not Started": "pending",
  Pending: "pending",
  Started: "pending",
  "In Progress": "pending",
  Processing: "pending",
  Submitted: "pending",
};

export const webhooksRouter: FastifyPluginAsync = async (app) => {
  app.post("/didit/webhook", async (request, reply) => {
    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
    const signatureV2 = readHeader(request.headers["x-signature-v2"]);
    const timestamp = readHeader(request.headers["x-timestamp"]);

    if (!rawBody || rawBody.length === 0) {
      return reply.status(400).send({ error: "Empty body" });
    }

    let event;
    try {
      const webhookRequest: {
        rawBody: Buffer;
        parsedBody?: unknown;
        signatureV2?: string;
        timestamp?: string;
      } = { rawBody };
      if (request.body !== undefined) webhookRequest.parsedBody = request.body;
      if (signatureV2 !== undefined) webhookRequest.signatureV2 = signatureV2;
      if (timestamp !== undefined) webhookRequest.timestamp = timestamp;

      event = await app.diditProvider.parseWebhook(webhookRequest);
    } catch (err) {
      app.log.warn({ err }, "webhook.rejected: verification or parsing failed");
      return reply.status(401).send({ error: "Invalid signature or payload" });
    }

    // Deduplicate: ignore replayed webhooks for the same session+status
    const dedupeKey = `${event.sessionId}:${event.rawStatus}`;
    if (app.store.isWebhookProcessed(dedupeKey)) {
      app.log.info({ sessionId: event.sessionId, rawStatus: event.rawStatus }, "webhook.duplicate_ignored");
      return reply.status(200).send({ received: true });
    }

    const internalStatus = DIDIT_STATUS_MAP[event.rawStatus] ?? "pending";
    const verification = await app.store.updateVerificationStatus(event.sessionId, internalStatus);

    if (!verification) {
      app.log.error({ sessionId: event.sessionId }, "webhook.no_record: no verification found");
      return reply.status(200).send({ received: true });
    }

    if (internalStatus === "approved") {
      const materializedClaims = await app.diditProvider.materializeClaims(event);
      const normalizedClaims = materializedClaims.normalizedClaims;
      app.log.info({
        verificationId: verification.id,
        hasDateOfBirth: !!event.decision.id_verification?.date_of_birth,
        ageOver18Granted: normalizedClaims.age_over_18 === true,
        ageOver21Granted: normalizedClaims.age_over_21 === true,
        kycPassed: normalizedClaims.kyc_passed === true,
      }, "webhook.claims_computed");
      await app.store.upsertClaims(verification.userId, verification.id, {
        ...(normalizedClaims.age_over_18 !== undefined ? { ageOver18: normalizedClaims.age_over_18 } : {}),
        ...(normalizedClaims.age_over_21 !== undefined ? { ageOver21: normalizedClaims.age_over_21 } : {}),
        ...(normalizedClaims.kyc_passed !== undefined ? { kycPassed: normalizedClaims.kyc_passed } : {}),
        ...(normalizedClaims.country_code !== undefined ? { countryCode: normalizedClaims.country_code } : {}),
        claimModelVersion: materializedClaims.claimModelVersion,
        derivedClaims: materializedClaims.derivedClaims,
        sourceCommitments: materializedClaims.sourceCommitments,
      });
      app.log.info({ verificationId: verification.id }, "webhook.claims_stored");
    }

    app.store.markWebhookProcessed(dedupeKey);
    app.log.info({ sessionId: event.sessionId, status: internalStatus }, "webhook.processed");

    return reply.status(200).send({ received: true });
  });
};

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim();
  return value?.trim();
}
