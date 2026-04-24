import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createRequire } from "node:module";
import { z } from "zod";
import {
  listProofProducts,
  type VerifierPolicy,
  verifyPresentation,
} from "@mintra/verifier-core";
import { AgeClaimProof, verifyAgeClaimProof } from "@mintra/zk-claims";
import {
  type PresentationEnvelope,
  PresentationEnvelopeSchema,
} from "@mintra/sdk-types";
import { createPresentationChallengeStoreFromEnv } from "./challenges/factory";
import { PresentationChallengeService } from "./challenges/service";
import { createPasskeyBindingStoreFromEnv } from "./passkeys/factory";
import { PasskeyBindingService } from "./passkeys/service";

const nodeRequire = createRequire(__filename);
const MinaSigner = nodeRequire("mina-signer");

const MinaPublicKeySchema = z
  .string()
  .regex(/^B62[1-9A-HJ-NP-Za-km-z]{50,54}$/, "Invalid Mina public key");

const ProofProductIdSchema = z.enum([
  "proof_of_age_18",
  "proof_of_kyc_passed",
  "proof_of_country_code",
]);

const VerifierPolicyOverrideSchema = z.object({
  minAge: z.union([z.literal(18), z.literal(21), z.null()]).optional(),
  requireKycPassed: z.boolean().optional(),
  countryAllowlist: z.array(z.string().min(2)).max(32).optional(),
  countryBlocklist: z.array(z.string().min(2)).max(32).optional(),
  maxCredentialAgeDays: z.number().int().positive().max(3650).nullable().optional(),
});

const CreatePresentationRequestSchema = z.object({
  proofProductId: ProofProductIdSchema.optional(),
  policy: VerifierPolicyOverrideSchema.optional(),
  expectedOwnerPublicKey: MinaPublicKeySchema.optional(),
  requirePasskeyBinding: z.boolean().optional(),
  action: z.string().min(1).max(128).optional(),
  expiresInSeconds: z.number().int().positive().max(3600).optional(),
});

const PasskeyRegistrationOptionsRequestSchema = z.object({
  walletAddress: MinaPublicKeySchema,
  deviceName: z.string().min(1).max(64).optional(),
});

const PasskeyRegistrationVerifyRequestSchema = z.object({
  registrationId: z.string().uuid(),
  credential: z.unknown(),
});

const PasskeyAssertionOptionsRequestSchema = z.object({
  challengeId: z.string().uuid(),
  walletAddress: MinaPublicKeySchema,
  presentationJson: z.string().min(1),
});

const VerifyPresentationRequestSchema = z.object({
  presentationEnvelope: z.unknown(),
  expectedOwnerPublicKey: MinaPublicKeySchema.optional(),
});

const VerifyAgeClaimProofRequestSchema = z.object({
  proof: z.unknown(),
});

export interface VerifierAppOptions {
  corsOrigin?: string;
  logger?: boolean;
}

export async function buildVerifierApp(opts: VerifierAppOptions = {}) {
  const corsOrigin = opts.corsOrigin ?? process.env["CORS_ORIGIN"] ?? "http://localhost:3000";
  const allowedOrigins =
    corsOrigin === "*"
      ? []
      : corsOrigin
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
  const verifierPublicUrl = process.env["VERIFIER_PUBLIC_URL"]?.trim();

  const app = Fastify({ logger: opts.logger ?? true });
  const challengeStore = createPresentationChallengeStoreFromEnv();
  const challengeService = new PresentationChallengeService(challengeStore.store);
  const passkeyStore = createPasskeyBindingStoreFromEnv();
  const passkeyService = new PasskeyBindingService(passkeyStore.store);
  const holderBindingSigners = [
    new MinaSigner({ network: "mainnet" }),
    new MinaSigner({ network: "testnet" }),
  ];

  app.log.info({ driver: challengeStore.driver }, "verifier.challenge_store_ready");
  app.log.info({ driver: passkeyStore.driver }, "verifier.passkey_store_ready");

  app.addHook("onSend", (_request, reply, _payload, done) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    done();
  });

  await app.register(cors, { origin: corsOrigin === "*" ? false : allowedOrigins });
  await app.register(rateLimit, { max: 60, timeWindow: "1 minute" });
  app.addHook("onClose", async () => {
    await challengeService.close();
    await passkeyService.close();
  });

  app.get("/api/proof-products", async () => {
    return {
      proofProducts: listProofProducts(),
    };
  });

  app.get("/api/passkeys/:walletAddress", async (request, reply) => {
    const audience = readAllowedOrigin(request.headers.origin, allowedOrigins);
    if (!audience) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    const params = z
      .object({ walletAddress: MinaPublicKeySchema })
      .safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "Invalid wallet address" });
    }

    const binding = await passkeyService.getBindingForWallet(params.data.walletAddress);
    return reply.send({
      registered: Boolean(binding),
      bindingId: binding?.bindingId ?? null,
      deviceName: binding?.deviceName ?? null,
    });
  });

  app.post("/api/passkeys/register/options", async (request, reply) => {
    const audience = readAllowedOrigin(request.headers.origin, allowedOrigins);
    if (!audience) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    const parsed = PasskeyRegistrationOptionsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request", detail: parsed.error.message });
    }

    try {
      const registration = await passkeyService.beginRegistration({
        walletAddress: parsed.data.walletAddress,
        audience,
        ...(parsed.data.deviceName === undefined ? {} : { deviceName: parsed.data.deviceName }),
      });
      return reply.send(registration);
    } catch (error) {
      app.log.error({ err: error }, "verifier.passkey_registration_options_failed");
      return reply.status(500).send({ error: "Could not create passkey registration options" });
    }
  });

  app.post("/api/passkeys/register/verify", async (request, reply) => {
    const audience = readAllowedOrigin(request.headers.origin, allowedOrigins);
    if (!audience) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    const parsed = PasskeyRegistrationVerifyRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request", detail: parsed.error.message });
    }

    try {
      const binding = await passkeyService.finishRegistration({
        registrationId: parsed.data.registrationId,
        credential: parsed.data.credential,
      });
      if (binding.origin !== audience) {
        return reply.status(403).send({ error: "Passkey registration origin mismatch" });
      }
      return reply.send({
        registered: true,
        binding: {
          bindingId: binding.bindingId,
          walletAddress: binding.walletAddress,
          deviceName: binding.deviceName,
          createdAt: binding.createdAt,
        },
      });
    } catch (error) {
      app.log.warn({ err: error }, "verifier.passkey_registration_verify_failed");
      return reply.status(403).send({ error: error instanceof Error ? error.message : "Passkey registration failed" });
    }
  });

  app.post("/api/passkeys/assertion/options", async (request, reply) => {
    const audience = readAllowedOrigin(request.headers.origin, allowedOrigins);
    if (!audience) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    const parsed = PasskeyAssertionOptionsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request", detail: parsed.error.message });
    }

    const challengeRecord = await challengeService.get(parsed.data.challengeId);
    if (!challengeRecord) {
      return reply.status(404).send({ error: "Presentation challenge was not issued by this verifier" });
    }
    if (challengeRecord.audience !== audience) {
      return reply.status(403).send({ error: "Presentation challenge audience does not match this verifier" });
    }

    try {
      const authentication = await passkeyService.buildAuthenticationRequest({
        challengeRecord,
        walletAddress: parsed.data.walletAddress,
        presentationJson: parsed.data.presentationJson,
      });

      if (!authentication) {
        return reply.status(404).send({
          error: "passkey_not_registered",
          detail: "Register a passkey for this wallet before passkey-required verification.",
        });
      }

      await challengeService.setPasskeyAuthentication(parsed.data.challengeId, authentication);
      return reply.send({ authentication });
    } catch (error) {
      app.log.warn({ err: error }, "verifier.passkey_assertion_options_failed");
      return reply.status(500).send({ error: "Could not create passkey assertion options" });
    }
  });

  app.get("/api/presentation-request", async (request, reply) => {
    const audience = readAllowedOrigin(request.headers.origin, allowedOrigins);
    if (!audience) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    try {
      const issued = await challengeService.issue({
        proofProductId: "proof_of_age_18",
        audience,
        verifier: verifierPublicUrl ?? audience,
        requirePasskeyBinding: false,
      });

      return reply.send({
        proofProduct: issued.requestEnvelope.proofProduct,
        challenge: issued.requestEnvelope.challenge,
        presentationRequest: issued.requestEnvelope.presentationRequest,
        presentationRequestJson: issued.requestEnvelope.presentationRequestJson,
        requestEnvelope: issued.requestEnvelope,
      });
    } catch (err) {
      app.log.error({ err }, "verifier.presentation_request_failed");
      return reply.status(500).send({ error: "Could not create presentation request" });
    }
  });

  app.post("/api/presentation-request", async (request, reply) => {
    const audience = readAllowedOrigin(request.headers.origin, allowedOrigins);
    if (!audience) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    let body: z.infer<typeof CreatePresentationRequestSchema>;
    try {
      body = CreatePresentationRequestSchema.parse(request.body ?? {});
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    try {
      const issued = await challengeService.issue({
        audience,
        verifier: verifierPublicUrl ?? audience,
        ...(body.proofProductId === undefined ? {} : { proofProductId: body.proofProductId }),
        ...(body.policy === undefined ? {} : { policy: body.policy as VerifierPolicy }),
        ...(body.expectedOwnerPublicKey === undefined
          ? {}
          : {
              walletAddress: body.expectedOwnerPublicKey,
              subjectId: body.expectedOwnerPublicKey,
            }),
        ...(body.requirePasskeyBinding === undefined
          ? {}
          : { requirePasskeyBinding: body.requirePasskeyBinding }),
        ...(body.action === undefined ? {} : { action: body.action }),
        ...(body.expiresInSeconds === undefined
          ? {}
          : { expiresInSeconds: body.expiresInSeconds }),
      });
      return reply.send({
        proofProduct: issued.requestEnvelope.proofProduct,
        challenge: issued.requestEnvelope.challenge,
        presentationRequest: issued.requestEnvelope.presentationRequest,
        presentationRequestJson: issued.requestEnvelope.presentationRequestJson,
        requestEnvelope: issued.requestEnvelope,
      });
    } catch (err) {
      app.log.error({ err }, "verifier.presentation_request_failed");
      return reply.status(500).send({ error: "Could not create presentation request" });
    }
  });

  app.post("/api/verify-presentation", async (request, reply) => {
    const audience = readAllowedOrigin(request.headers.origin, allowedOrigins);
    if (!audience) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    let body: z.infer<typeof VerifyPresentationRequestSchema>;
    let presentationEnvelope: PresentationEnvelope;
    try {
      body = VerifyPresentationRequestSchema.parse(request.body);
      presentationEnvelope = PresentationEnvelopeSchema.parse(body.presentationEnvelope);
    } catch (err) {
      return reply.status(400).send({ error: "Invalid request", detail: String(err) });
    }

    const challengeValidation = await challengeService.validateForPresentation({
      envelope: presentationEnvelope,
      audience,
    });
    if (!challengeValidation.ok) {
      return reply
        .status(challengeValidation.error.statusCode)
        .send(buildChallengeErrorResponse(presentationEnvelope, audience, challengeValidation.error));
    }

    const result = await verifyPresentation({
      envelope: presentationEnvelope,
      verifierIdentity: audience,
      expectedAudience: audience,
      holderBindingVerifier: {
        verifyMessage(input) {
          return holderBindingSigners.some((signer) =>
            signer.verifyMessage({
              publicKey: input.publicKey,
              data: input.data,
              signature: input.signature,
            })
          );
        },
      },
      passkeyBindingVerifier: {
        getBindingById(bindingId) {
          return passkeyService.getBindingById(bindingId);
        },
        updateBindingCounter(bindingId, counter) {
          return passkeyService.updateBindingCounter(bindingId, counter);
        },
      },
      ...(challengeValidation.record.passkeyAuthentication === null
        ? {}
        : { expectedPasskeyAuthentication: challengeValidation.record.passkeyAuthentication }),
      ...(body.expectedOwnerPublicKey === undefined
        ? {}
        : { expectedOwnerPublicKey: body.expectedOwnerPublicKey }),
    });

    if (!result.ok) {
      app.log.warn({ result }, "verifier.presentation_verify_failed");
      return reply.status(403).send(result);
    }

    return reply.send(result);
  });

  app.post("/api/zk/verify-age-proof", async (request, reply) => {
    const parsed = VerifyAgeClaimProofRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request", detail: parsed.error.message });
    }

    try {
      const proof = AgeClaimProof.fromJSON(parsed.data.proof);
      const verified = await verifyAgeClaimProof({ proof });

      return reply.send({
        ok: verified,
        proofType: "mintra.zk.age-threshold/v1",
        publicInput: proof.publicInput.toJSON(),
      });
    } catch (error) {
      app.log.warn({ err: error }, "verifier.zk_age_proof_failed");
      return reply.status(400).send({
        ok: false,
        proofType: "mintra.zk.age-threshold/v1",
        error: error instanceof Error ? error.message : "Could not verify age proof",
      });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "mintra-verifier",
    proofProducts: listProofProducts().map((product) => product.id),
    zkProofProducts: ["mintra.zk.age-threshold/v1"],
    challengeStore: challengeStore.driver,
    passkeyStore: passkeyStore.driver,
  }));

  return app;
}

function readAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: string[]
): string | null {
  if (!origin) return null;
  const normalized = origin.trim();
  if (!normalized) return null;
  if (!allowedOrigins.includes(normalized)) return null;
  return normalized;
}

function buildChallengeErrorResponse(
  envelope: PresentationEnvelope,
  audience: string,
  error: {
    code:
      | "unknown_challenge"
      | "expired_challenge"
      | "challenge_replay"
      | "challenge_audience_mismatch"
      | "challenge_nonce_mismatch"
      | "challenge_request_mismatch";
    message: string;
  }
) {
  return (
    {
      ok: false,
      challenge: {
        challengeId: envelope.challenge.challengeId,
        proofProductId: envelope.challenge.proofProductId,
        audience: envelope.challenge.audience,
      },
      holderBinding: {
        verified: false,
        reason: "Challenge validation failed before holder binding",
      },
      audience: {
        verified: false,
        expected: audience,
        actual: envelope.challenge.audience,
      },
      error: {
        code: error.code,
        message: error.message,
      },
      verifiedAt: new Date().toISOString(),
    } satisfies Record<string, unknown>
  );
}
