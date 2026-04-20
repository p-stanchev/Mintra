import type { FastifyPluginAsync } from "fastify";
import {
  IssueMinaCredentialRequestSchema,
} from "@mintra/sdk-types";
import { isValidMinaPublicKey, requireFreshWalletAuth } from "../auth";
import { z } from "zod";

const VerifyMinaPresentationRequestSchema = z.object({
  presentation: z.string().min(1),
  presentationRequestJson: z.string().min(1),
});

export const minaRouter: FastifyPluginAsync = async (app) => {
  app.post("/verify-presentation", async (request, reply) => {
    if (!app.minaPresentationVerifier) {
      return reply.status(501).send({ error: "Mina presentation verification is not enabled" });
    }

    const authWallet = request.authWalletAddress;
    if (!authWallet) {
      return reply.status(401).send({ error: "Wallet authentication required" });
    }

    let body: { presentation: string; presentationRequestJson: string };
    try {
      body = VerifyMinaPresentationRequestSchema.parse(request.body) as typeof body;
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const verifierIdentity = request.headers.origin;
    if (!verifierIdentity || !app.authAllowedOrigins.includes(verifierIdentity)) {
      return reply.status(403).send({ error: "Untrusted verifier origin" });
    }

    try {
      const requestSpec = await app.minaPresentationVerifier.parseHttpsPresentationRequest(
        body.presentationRequestJson
      );
      const verified = await app.minaPresentationVerifier.verifyAgeOver18Presentation({
        request: requestSpec,
        presentationJson: body.presentation,
        verifierIdentity,
      }) as { ageOver18: { toString(): string }; owner: { toBase58(): string } };

      const ownerPublicKey = verified.owner.toBase58();
      if (ownerPublicKey !== authWallet) {
        return reply.status(403).send({
          error: "Presentation owner does not match the authenticated wallet",
        });
      }

      if (verified.ageOver18.toString() !== "1") {
        return reply.status(403).send({ error: "Presentation does not satisfy the 18+ requirement" });
      }

      return reply.send({
        verified: true,
        ownerPublicKey,
        ageOver18: true,
      });
    } catch (err) {
      app.log.warn({ err }, "mina.presentation_verify_failed");
      return reply.status(403).send({ error: "Invalid wallet presentation" });
    }
  });

  app.post("/issue-credential", async (request, reply) => {
    if (!app.minaBridge) {
      return reply.status(501).send({ error: "Mina credential issuance is not enabled" });
    }

    let body: { userId: string; ownerPublicKey: string };
    try {
      body = IssueMinaCredentialRequestSchema.parse(request.body) as typeof body;
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const { userId, ownerPublicKey } = body;
    const authWallet = requireFreshWalletAuth(request, reply);
    if (!authWallet) return;

    if (!isValidMinaPublicKey(ownerPublicKey)) {
      return reply.status(400).send({ error: "Invalid owner public key" });
    }

    if (authWallet !== userId || authWallet !== ownerPublicKey) {
      return reply.status(403).send({ error: "Credential issuance is only allowed for the authenticated wallet" });
    }

    const claim = await app.store.getClaims(userId);
    if (!claim) {
      app.log.warn("mina.issue_denied: no approved claims");
      return reply.status(403).send({ error: "No approved verification found for this user" });
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

    app.log.info("mina.credential_issued");
    return reply.send(result);
  });
};
