import { createRequire } from "node:module";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createDiditProvider } from "@mintra/provider-didit";
import { WalletAuthStore, readBearerToken } from "./auth";
import { createStore } from "./store";
import { authRouter } from "./routes/auth";
import { verificationsRouter } from "./routes/verifications";
import { webhooksRouter } from "./routes/webhooks";
import { claimsRouter } from "./routes/claims";
import { minaRouter } from "./routes/mina";

export interface AppOptions {
  corsOrigin?: string;
  allowedCallbackOrigins?: string[];
  diditApiKey?: string;
  diditWebhookSecret?: string;
  diditWorkflowId?: string;
  minaIssuerPrivateKey?: string;
  logger?: boolean;
}

export async function buildApp(opts: AppOptions = {}) {
  const corsOrigin = opts.corsOrigin ?? process.env["CORS_ORIGIN"] ?? "http://localhost:3000";
  const authAllowedOrigins = corsOrigin === "*" ? [] : [corsOrigin];
  const allowedCallbackOrigins = opts.allowedCallbackOrigins ??
    (process.env["ALLOWED_CALLBACK_ORIGINS"] ?? corsOrigin)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const diditApiKey = opts.diditApiKey ?? requireEnv("DIDIT_API_KEY");
  const diditWebhookSecret = opts.diditWebhookSecret ?? requireEnv("DIDIT_WEBHOOK_SECRET");
  const diditWorkflowId = opts.diditWorkflowId ?? requireEnv("DIDIT_WORKFLOW_ID");
  const minaKey = opts.minaIssuerPrivateKey ?? process.env["MINA_ISSUER_PRIVATE_KEY"];
  const require = createRequire(__filename);

  const app = Fastify({ logger: opts.logger ?? true });
  const authStore = new WalletAuthStore(
    (process.env["MINA_SIGNER_NETWORK"] as "mainnet" | "testnet" | undefined) ?? "mainnet"
  );

  // Security headers (subset of helmet defaults, compatible with Fastify 4)
  app.addHook("onSend", (_request, reply, _payload, done) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-XSS-Protection", "0"); // modern browsers ignore this; CSP is the real guard
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    done();
  });

  // CORS: only allow the configured origin, never a wildcard in production
  const safeOrigin = corsOrigin === "*" ? false : corsOrigin;
  await app.register(cors, { origin: safeOrigin });

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

  // Wallet bearer auth — skips /health, auth bootstrap, and the Didit webhook (which uses HMAC)
  app.addHook("onRequest", (request, reply, done) => {
    const url = request.url.split("?")[0] ?? "";
    const token = readBearerToken(request);
    if (token) {
      const session = authStore.getSession(token);
      if (session) {
        request.authWalletAddress = session.walletAddress;
        request.authWalletIsFresh = authStore.isFreshSession(token);
      }
    }

    if (url === "/health" || url === "/api/providers/didit/webhook" || url.startsWith("/api/auth/")) {
      return done();
    }

    if (request.authWalletAddress) {
      return done();
    }
    reply.status(401).send({ error: "Wallet authentication required" });
    return;
  });

  const store = await createStore();
  app.decorate("store", store);
  app.decorate("authStore", authStore);
  app.decorate("authAllowedOrigins", authAllowedOrigins);
  app.decorate("allowedCallbackOrigins", allowedCallbackOrigins);
  app.addHook("onClose", async () => {
    await store.close();
    authStore.close();
  });

  const diditProvider = createDiditProvider({
    apiKey: diditApiKey,
    webhookSecret: diditWebhookSecret,
    workflowId: diditWorkflowId,
  });
  app.decorate("diditProvider", diditProvider);

  let minaBridge: { issueCredential(req: { userId: string; claims: Record<string, unknown>; ownerPublicKey: string }): Promise<{ credentialJson: string; issuerPublicKey: string }> } | null = null;
  let minaPresentationVerifier: {
    buildAgeOver18PresentationRequest(action?: string): Promise<unknown>;
    parseHttpsPresentationRequest(presentationRequestJson: string): Promise<unknown>;
    verifyAgeOver18Presentation(params: {
      request: unknown;
      presentationJson: string;
      verifierIdentity: string;
    }): Promise<unknown>;
  } | null = null;
  try {
    // @ts-ignore optional workspace package loaded only when configured
    const {
      createMinaBridge,
      buildAgeOver18PresentationRequest,
      parseHttpsPresentationRequest,
      verifyAgeOver18Presentation,
    } = require("@mintra/mina-bridge");

    minaPresentationVerifier = {
      buildAgeOver18PresentationRequest,
      parseHttpsPresentationRequest,
      verifyAgeOver18Presentation,
    };

    if (minaKey) {
      minaBridge = createMinaBridge({ issuerPrivateKey: minaKey });
    }
  } catch (err) {
    app.log.warn({ err }, "@mintra/mina-bridge unavailable — Mina proof features disabled");
  }
  app.decorate("minaBridge", minaBridge);
  app.decorate("minaPresentationVerifier", minaPresentationVerifier);

  await app.register(authRouter, { prefix: "/api/auth" });
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
