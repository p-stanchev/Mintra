import { createRequire } from "node:module";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createDiditProvider } from "@mintra/provider-didit";
import { createStore } from "./store";
import { verificationsRouter } from "./routes/verifications";
import { webhooksRouter } from "./routes/webhooks";
import { claimsRouter } from "./routes/claims";
import { minaRouter } from "./routes/mina";

export interface AppOptions {
  corsOrigin?: string;
  diditApiKey?: string;
  diditWebhookSecret?: string;
  diditWorkflowId?: string;
  minaIssuerPrivateKey?: string;
  logger?: boolean;
}

export async function buildApp(opts: AppOptions = {}) {
  const corsOrigin = opts.corsOrigin ?? process.env["CORS_ORIGIN"] ?? "http://localhost:3000";
  const diditApiKey = opts.diditApiKey ?? requireEnv("DIDIT_API_KEY");
  const diditWebhookSecret = opts.diditWebhookSecret ?? requireEnv("DIDIT_WEBHOOK_SECRET");
  const diditWorkflowId = opts.diditWorkflowId ?? requireEnv("DIDIT_WORKFLOW_ID");
  const minaKey = opts.minaIssuerPrivateKey ?? process.env["MINA_ISSUER_PRIVATE_KEY"];
  const require = createRequire(__filename);

  const app = Fastify({ logger: opts.logger ?? true });

  await app.register(cors, { origin: corsOrigin });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  // Raw body capture for HMAC verification on the webhook route
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_, body, done) => {
      try {
        const buf = body as Buffer;
        done(null, { rawBody: buf, parsed: JSON.parse(buf.toString("utf-8")) });
      } catch (err) {
        done(err as Error);
      }
    }
  );

  app.addHook("preHandler", (request, _reply, done) => {
    if (
      request.body &&
      typeof request.body === "object" &&
      "parsed" in (request.body as Record<string, unknown>) &&
      "rawBody" in (request.body as Record<string, unknown>)
    ) {
      const b = request.body as { rawBody: Buffer; parsed: unknown };
      (request as unknown as Record<string, unknown>)["rawBody"] = b.rawBody;
      request.body = b.parsed;
    }
    done();
  });

  const store = await createStore();
  app.decorate("store", store);
  app.addHook("onClose", async () => {
    await store.close();
  });

  const diditProvider = createDiditProvider({
    apiKey: diditApiKey,
    webhookSecret: diditWebhookSecret,
    workflowId: diditWorkflowId,
  });
  app.decorate("diditProvider", diditProvider);

  let minaBridge: { issueCredential(req: { userId: string; claims: Record<string, unknown>; ownerPublicKey: string }): Promise<{ credentialJson: string; issuerPublicKey: string }> } | null = null;
  if (minaKey) {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore optional workspace package loaded only when configured
      const { createMinaBridge } = require("@mintra/mina-bridge");
      minaBridge = createMinaBridge({ issuerPrivateKey: minaKey });
    } catch (err) {
      app.log.warn({ err }, "@mintra/mina-bridge unavailable or issuer key invalid — Mina credential issuance disabled");
    }
  }
  app.decorate("minaBridge", minaBridge);

  await app.register(verificationsRouter, { prefix: "/api/verifications" });
  await app.register(webhooksRouter, { prefix: "/api/providers" });
  await app.register(claimsRouter, { prefix: "/api/claims" });
  await app.register(minaRouter, { prefix: "/api/mina" });

  app.get("/health", async () => ({ ok: true, service: "mintra-api" }));

  return app;
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}
