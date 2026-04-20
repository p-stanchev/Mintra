import type { FastifyPluginAsync } from "fastify";
import {
  CreateWalletAuthChallengeRequestSchema,
  CreateWalletAuthChallengeResponseSchema,
  VerifyWalletAuthRequestSchema,
  VerifyWalletAuthResponseSchema,
} from "@mintra/sdk-types";
import { readBearerToken, readTrustedOrigin, requireWalletAuth } from "../auth";

export const authRouter: FastifyPluginAsync = async (app) => {
  app.post("/challenge", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    let body: { walletAddress: string };
    try {
      body = CreateWalletAuthChallengeRequestSchema.parse(request.body) as typeof body;
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const origin = readTrustedOrigin(request, app.authAllowedOrigins);
    if (!origin) {
      return reply.status(403).send({ error: "Untrusted origin" });
    }

    const challenge = app.authStore.createChallenge(
      body.walletAddress,
      origin
    );

    return reply.send(
      CreateWalletAuthChallengeResponseSchema.parse({
        challengeId: challenge.id,
        message: challenge.message,
        expiresAt: new Date(challenge.expiresAt).toISOString(),
      })
    );
  });

  app.post("/verify", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    let body: {
      challengeId: string;
      publicKey: string;
      data: string;
      signature: { field: string; scalar: string };
    };
    try {
      body = VerifyWalletAuthRequestSchema.parse(request.body) as typeof body;
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const origin = readTrustedOrigin(request, app.authAllowedOrigins);
    if (!origin) {
      return reply.status(403).send({ error: "Untrusted origin" });
    }

    try {
      const session = app.authStore.verifySignedChallenge({ ...body, origin });
      return reply.send(
        VerifyWalletAuthResponseSchema.parse({
          token: session.token,
          walletAddress: session.walletAddress,
          expiresAt: new Date(session.expiresAt).toISOString(),
        })
      );
    } catch (err) {
      return reply.status(401).send({
        error: "Wallet authentication failed",
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  app.post("/logout", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const authWallet = requireWalletAuth(request, reply);
    if (!authWallet) return;

    const token = readBearerToken(request);
    if (!token) {
      return reply.status(400).send({ error: "Missing bearer token" });
    }

    app.authStore.revokeSession(token);
    return reply.status(204).send();
  });
};
