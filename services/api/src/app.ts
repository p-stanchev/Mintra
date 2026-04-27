import { createRequire } from "node:module";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createDiditProvider } from "@mintra/provider-didit";
import { createIdNormProvider } from "@mintra/provider-idnorm";
import type { CredentialTrust, VerificationProviderId } from "@mintra/sdk-types";
import { WalletAuthStore, readBearerToken } from "./auth";
import { createStore } from "./store";
import { authRouter } from "./routes/auth";
import { verificationsRouter } from "./routes/verifications";
import { webhooksRouter } from "./routes/webhooks";
import { claimsRouter } from "./routes/claims";
import { minaRouter } from "./routes/mina";
import { demoRouter } from "./routes/demo";

export interface AppOptions {
  corsOrigin?: string;
  allowedCallbackOrigins?: string[];
  diditApiKey?: string;
  diditWebhookSecret?: string;
  diditWorkflowId?: string;
  idnormApiKey?: string;
  idnormWebhookSecret?: string;
  idnormConfigurationId?: string;
  defaultVerificationProviderId?: VerificationProviderId;
  minaIssuerPrivateKey?: string;
  issuerEnvironment?: CredentialTrust["issuerEnvironment"];
  issuerId?: string;
  issuerDisplayName?: string;
  issuerAssuranceLevel?: CredentialTrust["assuranceLevel"];
  logger?: boolean;
}

export async function buildApp(opts: AppOptions = {}) {
  const corsOrigin = opts.corsOrigin ?? process.env["CORS_ORIGIN"] ?? "http://localhost:3000";
  const authAllowedOrigins = corsOrigin === "*"
    ? []
    : corsOrigin.split(",").map((s) => s.trim()).filter(Boolean);
  const allowedCallbackOrigins = opts.allowedCallbackOrigins ??
    (process.env["ALLOWED_CALLBACK_ORIGINS"] ?? corsOrigin)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const diditApiKey = opts.diditApiKey ?? readEnv("DIDIT_API_KEY");
  const diditWebhookSecret = opts.diditWebhookSecret ?? readEnv("DIDIT_WEBHOOK_SECRET");
  const diditWorkflowId = opts.diditWorkflowId ?? readEnv("DIDIT_WORKFLOW_ID");
  const idnormApiKey = opts.idnormApiKey ?? readEnv("IDNORM_API_KEY");
  const idnormWebhookSecret = opts.idnormWebhookSecret ?? readEnv("IDNORM_WEBHOOK_SECRET");
  const idnormConfigurationId = opts.idnormConfigurationId ?? readEnv("IDNORM_CONFIGURATION_ID");
  const defaultVerificationProviderId =
    opts.defaultVerificationProviderId ??
    normalizeProviderId(readEnv("MINTRA_DEFAULT_PROVIDER")) ??
    null;
  const minaKey = opts.minaIssuerPrivateKey ?? process.env["MINA_ISSUER_PRIVATE_KEY"];
  const issuerEnvironment = opts.issuerEnvironment ??
    (process.env["MINTRA_ISSUER_ENVIRONMENT"] === "demo" ? "demo" : "production");
  const nodeRequire = createRequire(__filename);
  const MinaSigner = nodeRequire("mina-signer");
  const credentialTrustDefaults: CredentialTrust = {
    issuerEnvironment,
    issuerId: opts.issuerId ??
      process.env["MINTRA_ISSUER_ID"] ??
      (issuerEnvironment === "demo" ? "mintra-demo-issuer" : "mintra-production-issuer"),
    issuerDisplayName: opts.issuerDisplayName ??
      process.env["MINTRA_ISSUER_DISPLAY_NAME"] ??
      (issuerEnvironment === "demo" ? "Mintra Demo Issuer" : "Mintra"),
    assuranceLevel: opts.issuerAssuranceLevel ??
      (issuerEnvironment === "demo" ? "low" : "high"),
    evidenceClass: "provider-normalized",
    demoCredential: issuerEnvironment === "demo",
  };

  const app = Fastify({ logger: opts.logger ?? true });
  const authStore = new WalletAuthStore();

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

  // Wallet bearer auth — skips /health, auth bootstrap, and provider webhooks (which use HMAC)
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

    if (
      url === "/health" ||
      url === "/api/providers/didit/webhook" ||
      url === "/api/providers/idnorm/webhook" ||
      url.startsWith("/api/auth/")
    ) {
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
  app.decorate("credentialTrustDefaults", credentialTrustDefaults);
  app.addHook("onClose", async () => {
    await store.close();
    authStore.close();
  });

  const verificationProviders: Partial<Record<VerificationProviderId, ReturnType<typeof createDiditProvider> | ReturnType<typeof createIdNormProvider>>> = {};
  const diditProvider =
    diditApiKey && diditWebhookSecret && diditWorkflowId
      ? createDiditProvider({
          apiKey: diditApiKey,
          webhookSecret: diditWebhookSecret,
          workflowId: diditWorkflowId,
        })
      : null;
  const idnormProvider =
    idnormApiKey && idnormWebhookSecret && idnormConfigurationId
      ? createIdNormProvider({
          apiKey: idnormApiKey,
          webhookSecret: idnormWebhookSecret,
          configurationId: idnormConfigurationId,
        })
      : null;
  if (diditProvider) verificationProviders.didit = diditProvider;
  if (idnormProvider) verificationProviders.idnorm = idnormProvider;
  const resolvedDefaultProviderId =
    (defaultVerificationProviderId && verificationProviders[defaultVerificationProviderId]
      ? defaultVerificationProviderId
      : null) ??
    (diditProvider ? "didit" : null) ??
    (idnormProvider ? "idnorm" : null);

  if (!resolvedDefaultProviderId) {
    throw new Error(
      "No verification provider is configured. Set DIDIT_* or IDNORM_* environment variables."
    );
  }

  app.decorate("diditProvider", diditProvider);
  app.decorate("idnormProvider", idnormProvider);
  app.decorate("verificationProviders", verificationProviders);
  app.decorate("defaultVerificationProviderId", resolvedDefaultProviderId);

  let minaBridge: {
    issueCredential(req: {
      userId: string;
      claims: Record<string, unknown>;
      ownerPublicKey: string;
      credentialMetadata?: unknown;
    }): Promise<{ credentialJson: string; issuerPublicKey: string; credentialMetadata?: unknown }>;
  } | null = null;
  try {
    // @ts-ignore optional workspace package loaded only when configured
    const { createMinaBridge } = nodeRequire("@mintra/mina-bridge");

    if (minaKey) {
      minaBridge = createMinaBridge({ issuerPrivateKey: minaKey });
    }
  } catch (err) {
    app.log.warn({ err }, "@mintra/mina-bridge unavailable — Mina credential issuance disabled");
  }
  let minaIssuerPublicKey: string | null = null;
  if (minaKey) {
    try {
      const signer = new MinaSigner({ network: "mainnet" });
      minaIssuerPublicKey = signer.derivePublicKey(minaKey);
    } catch (err) {
      app.log.warn({ err }, "Could not derive Mina issuer public key");
    }
  }
  app.decorate("minaBridge", minaBridge);
  app.decorate("minaIssuerPrivateKey", minaKey ?? null);
  app.decorate("minaIssuerPublicKey", minaIssuerPublicKey);

  await app.register(authRouter, { prefix: "/api/auth" });
  await app.register(verificationsRouter, { prefix: "/api/verifications" });
  await app.register(webhooksRouter, { prefix: "/api/providers" });
  await app.register(claimsRouter, { prefix: "/api/claims" });
  await app.register(minaRouter, { prefix: "/api/mina" });
  await app.register(demoRouter, { prefix: "/api/demo" });

  app.get("/health", async () => ({
    ok: true,
    service: "mintra-api",
    verificationProviders: Object.keys(verificationProviders),
    defaultVerificationProviderId: resolvedDefaultProviderId,
    minaIssuerPublicKey,
    credentialTrustDefaults: {
      issuerEnvironment: credentialTrustDefaults.issuerEnvironment,
      issuerId: credentialTrustDefaults.issuerId,
      issuerDisplayName: credentialTrustDefaults.issuerDisplayName,
      assuranceLevel: credentialTrustDefaults.assuranceLevel,
      evidenceClass: credentialTrustDefaults.evidenceClass,
      demoCredential: credentialTrustDefaults.demoCredential,
    },
  }));

  return app;
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function readEnv(key: string): string | undefined {
  const val = process.env[key];
  return val?.trim() ? val.trim() : undefined;
}

function normalizeProviderId(value: string | undefined): VerificationProviderId | null {
  if (value === "didit" || value === "idnorm") return value;
  return null;
}
