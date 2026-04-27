import type { FastifyPluginAsync } from "fastify";
import type { VerificationProviderId } from "@mintra/sdk-types";

export const webhooksRouter: FastifyPluginAsync = async (app) => {
  const providerIds = Object.keys(app.verificationProviders) as VerificationProviderId[];

  for (const providerId of providerIds) {
    app.post(`/${providerId}/webhook`, async (request, reply) => {
      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
      const signatureV2 = readHeader(request.headers["x-signature-v2"]);
      const timestamp = readHeader(request.headers["x-timestamp"]);
      const signature = readHeader(request.headers["idnorm-signature"]);

      if (!rawBody || rawBody.length === 0) {
        return reply.status(400).send({ error: "Empty body" });
      }

      const provider = app.verificationProviders[providerId];
      if (!provider) {
        return reply.status(503).send({ error: `Verification provider '${providerId}' is not configured` });
      }

      let event;
      try {
        const webhookRequest: {
          rawBody: Buffer;
          parsedBody?: unknown;
          signature?: string;
          signatureV2?: string;
          timestamp?: string;
        } = { rawBody };
        if (request.body !== undefined) webhookRequest.parsedBody = request.body;
        if (signature !== undefined) webhookRequest.signature = signature;
        if (signatureV2 !== undefined) webhookRequest.signatureV2 = signatureV2;
        if (timestamp !== undefined) webhookRequest.timestamp = timestamp;

        event = await provider.parseWebhook(webhookRequest);
      } catch (err) {
        app.log.warn({ err, providerId }, "webhook.rejected: verification or parsing failed");
        return reply.status(401).send({ error: "Invalid signature or payload" });
      }

      const dedupeKey = `${providerId}:${event.sessionId}:${event.rawStatus}`;
      if (app.store.isWebhookProcessed(dedupeKey)) {
        app.log.info({ providerId, sessionId: event.sessionId, rawStatus: event.rawStatus }, "webhook.duplicate_ignored");
        return reply.status(200).send({ received: true });
      }

      const internalStatus = provider.mapVerificationStatus(event);
      const verification = await app.store.updateVerificationStatus(event.sessionId, internalStatus);

      if (!verification) {
        app.log.error({ providerId, sessionId: event.sessionId }, "webhook.no_record: no verification found");
        return reply.status(200).send({ received: true });
      }

      if (internalStatus === "approved") {
        const materializedClaims = await provider.materializeClaims(event);
        const normalizedClaims = materializedClaims.normalizedClaims;
        app.log.info({
          providerId,
          verificationId: verification.id,
          hasDateOfBirth: !!materializedClaims.dateOfBirth,
          ageOver18Granted: normalizedClaims.age_over_18 === true,
          ageOver21Granted: normalizedClaims.age_over_21 === true,
          kycPassed: normalizedClaims.kyc_passed === true,
        }, "webhook.claims_computed");
        await app.store.upsertClaims(verification.userId, verification.id, {
          ...(normalizedClaims.age_over_18 !== undefined ? { ageOver18: normalizedClaims.age_over_18 } : {}),
          ...(normalizedClaims.age_over_21 !== undefined ? { ageOver21: normalizedClaims.age_over_21 } : {}),
          ...(normalizedClaims.kyc_passed !== undefined ? { kycPassed: normalizedClaims.kyc_passed } : {}),
          ...(normalizedClaims.country_code !== undefined ? { countryCode: normalizedClaims.country_code } : {}),
          ...(normalizedClaims.nationality !== undefined ? { nationality: normalizedClaims.nationality } : {}),
          ...(materializedClaims.dateOfBirth !== undefined ? { dateOfBirth: materializedClaims.dateOfBirth } : {}),
          ...(materializedClaims.documentExpiresAt !== undefined ? { documentExpiresAt: materializedClaims.documentExpiresAt } : {}),
          provider: verification.provider,
          claimModelVersion: materializedClaims.claimModelVersion,
          derivedClaims: materializedClaims.derivedClaims,
          sourceCommitments: materializedClaims.sourceCommitments,
          credentialTrust: materializedClaims.credentialTrust ?? {
            issuerEnvironment: "production",
            issuerId: app.credentialTrustDefaults.issuerId,
            issuerDisplayName: app.credentialTrustDefaults.issuerDisplayName,
            assuranceLevel: "high",
            evidenceClass: "provider-normalized",
            demoCredential: false,
          },
        });
        app.log.info({ providerId, verificationId: verification.id }, "webhook.claims_stored");
      }

      app.store.markWebhookProcessed(dedupeKey);
      app.log.info({ providerId, sessionId: event.sessionId, status: internalStatus }, "webhook.processed");

      return reply.status(200).send({ received: true });
    });
  }
};

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim();
  return value?.trim();
}
