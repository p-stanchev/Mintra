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
    const signature =
      (request.headers["x-signature-v2"] as string | undefined) ??
      (request.headers["x-signature"] as string | undefined) ??
      "";

    if (!rawBody || rawBody.length === 0) {
      return reply.status(400).send({ error: "Empty body" });
    }

    let event;
    try {
      event = await app.diditProvider.parseWebhook({ rawBody, signature });
    } catch (err) {
      app.log.warn({ err }, "Webhook verification or parsing failed");
      return reply.status(401).send({ error: "Invalid signature or payload" });
    }

    const internalStatus = DIDIT_STATUS_MAP[event.rawStatus] ?? "pending";
    const verification = await app.store.updateVerificationStatus(event.sessionId, internalStatus);

    if (!verification) {
      app.log.error({ sessionId: event.sessionId }, "No verification record found for webhook");
      return reply.status(200).send({ received: true });
    }

    if (internalStatus === "approved") {
      const normalizedClaims = app.diditProvider.mapClaims(event);
      await app.store.upsertClaims(verification.userId, verification.id, {
        ...(normalizedClaims.age_over_18 !== undefined ? { ageOver18: normalizedClaims.age_over_18 } : {}),
        ...(normalizedClaims.kyc_passed !== undefined ? { kycPassed: normalizedClaims.kyc_passed } : {}),
        ...(normalizedClaims.country_code !== undefined ? { countryCode: normalizedClaims.country_code } : {}),
      });
    }

    return reply.status(200).send({ received: true });
  });
};
