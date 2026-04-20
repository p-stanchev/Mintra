import type { FastifyPluginAsync } from "fastify";
import {
  CreateWalletAuthChallengeRequestSchema,
  CreateWalletAuthChallengeResponseSchema,
  VerifyWalletAuthRequestSchema,
  VerifyWalletAuthResponseSchema,
} from "@mintra/sdk-types";

export const authRouter: FastifyPluginAsync = async (app) => {
  app.post("/challenge", async (request, reply) => {
    let body: { walletAddress: string };
    try {
      body = CreateWalletAuthChallengeRequestSchema.parse(request.body) as typeof body;
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const challenge = app.authStore.createChallenge(
      body.walletAddress,
      typeof request.headers.origin === "string" ? request.headers.origin : undefined
    );

    return reply.send(
      CreateWalletAuthChallengeResponseSchema.parse({
        challengeId: challenge.id,
        message: challenge.message,
        expiresAt: new Date(challenge.expiresAt).toISOString(),
      })
    );
  });

  app.post("/verify", async (request, reply) => {
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

    try {
      const session = app.authStore.verifySignedChallenge(body);
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
};
