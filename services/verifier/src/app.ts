import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import {
  parseHttpsPresentationRequest,
  verifyAgeOver18Presentation,
} from "@mintra/verifier-core";

const MinaPublicKeySchema = z
  .string()
  .regex(/^B62[1-9A-HJ-NP-Za-km-z]{50,54}$/, "Invalid Mina public key");

const VerifyPresentationRequestSchema = z.object({
  presentation: z.string().min(1),
  presentationRequestJson: z.string().min(1),
  expectedOwnerPublicKey: MinaPublicKeySchema,
});

export interface VerifierAppOptions {
  corsOrigin?: string;
  logger?: boolean;
}

export async function buildVerifierApp(opts: VerifierAppOptions = {}) {
  const corsOrigin = opts.corsOrigin ?? process.env["CORS_ORIGIN"] ?? "http://localhost:3000";
  const allowedOrigins = corsOrigin === "*"
    ? []
    : corsOrigin.split(",").map((value) => value.trim()).filter(Boolean);

  const app = Fastify({ logger: opts.logger ?? true });

  app.addHook("onSend", (_request, reply, _payload, done) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    done();
  });

  await app.register(cors, { origin: corsOrigin === "*" ? false : allowedOrigins });
  await app.register(rateLimit, { max: 30, timeWindow: "1 minute" });

  app.post("/api/verify-presentation", async (request, reply) => {
    let body: z.infer<typeof VerifyPresentationRequestSchema>;
    try {
      body = VerifyPresentationRequestSchema.parse(request.body);
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const verifierIdentity = request.headers.origin;
    if (!verifierIdentity || !allowedOrigins.includes(verifierIdentity)) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    try {
      const requestSpec = await parseHttpsPresentationRequest(body.presentationRequestJson);
      const verified = await verifyAgeOver18Presentation({
        request: requestSpec,
        presentationJson: body.presentation,
        verifierIdentity,
      });

      const ownerPublicKey = verified.ownerPublicKey;
      if (ownerPublicKey !== body.expectedOwnerPublicKey) {
        return reply.status(403).send({
          error: "Presentation owner does not match the requested wallet",
        });
      }

      if (!verified.ageOver18) {
        return reply.status(403).send({
          error: "Presentation does not satisfy the 18+ requirement",
        });
      }

      return reply.send({
        verified: true,
        ownerPublicKey,
        ageOver18: true,
      });
    } catch (err) {
      app.log.warn({ err }, "verifier.presentation_verify_failed");
      return reply.status(403).send({ error: "Invalid wallet presentation" });
    }
  });

  app.get("/health", async () => ({ ok: true, service: "mintra-verifier" }));

  return app;
}
