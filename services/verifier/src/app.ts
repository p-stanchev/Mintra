import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createRequire } from "node:module";
import { z } from "zod";
import {
  createZkPolicyRequest,
  listProofProducts,
  type VerifierPolicy,
  verifyPresentation,
} from "@mintra/verifier-core";
import {
  compileAgeClaimProgram,
  compileCountryMembershipProgram,
  compileKycPassedProgram,
} from "@mintra/zk-claims";
import {
  canonicalizeZkProofMaterialBundlePayload,
  type PresentationEnvelope,
  PresentationEnvelopeSchema,
  SignedZkProofMaterialBundleSchema,
  ZkProofTypeSchema,
  ZkPolicyRequestSchema,
} from "@mintra/sdk-types";
import { createPresentationChallengeStoreFromEnv } from "./challenges/factory";
import { PresentationChallengeService } from "./challenges/service";
import { createPasskeyBindingStoreFromEnv } from "./passkeys/factory";
import { PasskeyBindingService } from "./passkeys/service";
import {
  resolveVerifierTrustContext,
  type TrustSourceMode,
  type VerificationKeyHashes,
} from "./trust";

const nodeRequire = createRequire(__filename);
const MinaSigner = nodeRequire("mina-signer");
const { verify: verifyJsonProof } = nodeRequire("o1js") as {
  verify: (proof: unknown, verificationKey: unknown) => Promise<boolean>;
};

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

const VerifyZkClaimProofRequestSchema = z.object({
  request: z.unknown(),
  proof: z.unknown(),
  proofMaterialBundle: SignedZkProofMaterialBundleSchema,
});

const CreateZkPolicyRequestSchema = z.object({
  proofType: ZkProofTypeSchema.optional(),
  minAge: z.union([z.literal(18), z.literal(21)]).optional(),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  countryAllowlist: z.array(z.string().min(2)).max(8).optional(),
  countryBlocklist: z.array(z.string().min(2)).max(8).optional(),
  expiresInSeconds: z.number().int().positive().max(3600).optional(),
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
  const envTrustedIssuerPublicKey =
    process.env["TRUSTED_ISSUER_PUBLIC_KEY"]?.trim() ??
    process.env["MINTRA_TRUSTED_ISSUER_PUBLIC_KEY"]?.trim() ??
    process.env["MINTRA_ISSUER_PUBLIC_KEY"]?.trim() ??
    null;
  const trustSourceMode = readTrustSourceMode(process.env["TRUST_SOURCE"]);
  const registryAddress = process.env["MINTRA_REGISTRY_ADDRESS"]?.trim() ?? null;
  const minaGraphqlUrl = process.env["MINA_GRAPHQL_URL"]?.trim() ?? null;
  const ageProgram = await compileAgeClaimProgram();
  const kycProgram = await compileKycPassedProgram();
  const countryProgram = await compileCountryMembershipProgram();
  const verificationKeyHashes: VerificationKeyHashes = {
    age: ageProgram.verificationKey.hash.toString(),
    kyc: kycProgram.verificationKey.hash.toString(),
    country: countryProgram.verificationKey.hash.toString(),
  };
  const trustContext = await resolveVerifierTrustContext({
    mode: trustSourceMode,
    envTrustedIssuerPublicKey,
    registryAddress,
    minaGraphqlUrl,
    verificationKeyHashes,
  });

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
  app.log.info(
    {
      mode: trustSourceMode,
      source: trustContext.source,
      trustedIssuerPublicKey: trustContext.trustedIssuerPublicKey,
      registryAddress: trustContext.registry?.address ?? registryAddress,
      registryGraphqlUrl: trustContext.registry?.graphqlUrl ?? minaGraphqlUrl,
      registryError: trustContext.registryError,
      verificationKeyHashes: trustContext.verificationKeyHashes,
    },
    "verifier.trust_context_ready"
  );

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

  app.post("/api/zk/verify-proof", async (request, reply) => {
    const audience = readAllowedOrigin(request.headers.origin, allowedOrigins);
    if (!audience) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    const parsed = VerifyZkClaimProofRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request", detail: parsed.error.message });
    }

    try {
      const result = await verifyZkProofPayload({
        requestBody: parsed.data,
        audience,
        trustedIssuerPublicKey: trustContext.trustedIssuerPublicKey,
        verificationKeys: {
          age: ageProgram.verificationKey,
          kyc: kycProgram.verificationKey,
          country: countryProgram.verificationKey,
        },
      });
      return reply.status(result.statusCode).send(result.payload);
    } catch (error) {
      app.log.warn({ err: error }, "verifier.zk_proof_failed");
      return reply.status(400).send({
        ok: false,
        proofType: "mintra.zk.age-threshold/v1",
        audience,
        challengeId: "00000000-0000-0000-0000-000000000000",
        error: {
          code: "zk_verification_failed",
          message: "Could not verify zk proof",
          detail: error instanceof Error ? error.message : String(error),
        },
        verifiedAt: new Date().toISOString(),
      });
    }
  });

  app.post("/api/zk/verify-age-proof", async (request, reply) => {
    const audience = readAllowedOrigin(request.headers.origin, allowedOrigins);
    if (!audience) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    const parsed = VerifyZkClaimProofRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request", detail: parsed.error.message });
    }

    try {
      const result = await verifyZkProofPayload({
        requestBody: parsed.data,
        audience,
        trustedIssuerPublicKey: trustContext.trustedIssuerPublicKey,
        verificationKeys: {
          age: ageProgram.verificationKey,
          kyc: kycProgram.verificationKey,
          country: countryProgram.verificationKey,
        },
      });
      return reply.status(result.statusCode).send(result.payload);
    } catch (error) {
      app.log.warn({ err: error }, "verifier.zk_age_proof_failed");
      return reply.status(400).send({
        ok: false,
        proofType: "mintra.zk.age-threshold/v1",
        audience,
        challengeId: "00000000-0000-0000-0000-000000000000",
        error: {
          code: "zk_verification_failed",
          message: "Could not verify age proof",
          detail: error instanceof Error ? error.message : String(error),
        },
        verifiedAt: new Date().toISOString(),
      });
    }
  });

  app.post("/api/zk/policy-request", async (request, reply) => {
    const audience = readAllowedOrigin(request.headers.origin, allowedOrigins);
    if (!audience) {
      return reply.status(403).send({ error: "Verifier origin is not allowed" });
    }

    const parsed = CreateZkPolicyRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid request", detail: parsed.error.message });
    }

    try {
      const zkRequest = createZkPolicyRequest({
        audience,
        verifier: verifierPublicUrl ?? audience,
        ...(parsed.data.proofType === undefined ? {} : { proofType: parsed.data.proofType }),
        ...(parsed.data.minAge === undefined ? {} : { minAge: parsed.data.minAge }),
        ...(parsed.data.referenceDate === undefined
          ? {}
          : { referenceDate: parsed.data.referenceDate }),
        ...(parsed.data.countryAllowlist === undefined
          ? {}
          : { countryAllowlist: parsed.data.countryAllowlist }),
        ...(parsed.data.countryBlocklist === undefined
          ? {}
          : { countryBlocklist: parsed.data.countryBlocklist }),
        ...(parsed.data.expiresInSeconds === undefined
          ? {}
          : { expiresInSeconds: parsed.data.expiresInSeconds }),
      });
      return reply.send(zkRequest);
    } catch (error) {
      app.log.warn({ err: error }, "verifier.zk_policy_request_failed");
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Could not create zk policy request",
      });
    }
  });

  app.get("/health", async () => ({
    ok: true,
    service: "mintra-verifier",
    proofProducts: listProofProducts().map((product) => product.id),
    zkProofProducts: [
      "mintra.zk.age-threshold/v1",
      "mintra.zk.kyc-passed/v1",
      "mintra.zk.country-membership/v1",
    ],
    challengeStore: challengeStore.driver,
    passkeyStore: passkeyStore.driver,
    trustSourceMode,
    trustSource: trustContext.source,
    trustedIssuerPublicKey: trustContext.trustedIssuerPublicKey,
    verificationKeyHashes: trustContext.verificationKeyHashes,
    registry:
      trustContext.registry === null
        ? null
        : {
            address: trustContext.registry.address,
            graphqlUrl: trustContext.registry.graphqlUrl,
            issuerPublicKey: trustContext.registry.issuerPublicKey,
            credentialRoot: trustContext.registry.credentialRoot,
            revocationRoot: trustContext.registry.revocationRoot,
          },
    registryError: trustContext.registryError,
  }));

  return app;
}

function readRawProofPublicInput(proof: unknown) {
  if (!proof || typeof proof !== "object") return null;
  const maybeProof = proof as { publicInput?: unknown };
  return Array.isArray(maybeProof.publicInput) ? maybeProof.publicInput : null;
}

function toAgePublicInputFromRawProof(proof: unknown) {
  const publicInput = readRawProofPublicInput(proof);
  if (!publicInput || publicInput.length < 5) {
    throw new Error("Age proof request payload did not include a valid publicInput array");
  }

  return {
    dobCommitment: String(publicInput[0]),
    minAge: Number(publicInput[1]) as 18 | 21,
    referenceDate: [
      String(publicInput[2]),
      String(publicInput[3]).padStart(2, "0"),
      String(publicInput[4]).padStart(2, "0"),
    ].join("-"),
  };
}

function toKycPublicInputFromRawProof(proof: unknown) {
  const publicInput = readRawProofPublicInput(proof);
  if (!publicInput || publicInput.length < 1) {
    throw new Error("KYC proof request payload did not include a valid publicInput array");
  }

  return {
    kycCommitment: String(publicInput[0]),
  };
}

function toCountryPublicInputFromRawProof(proof: unknown) {
  const publicInput = readRawProofPublicInput(proof);
  if (!publicInput || publicInput.length < 17) {
    throw new Error("Country proof request payload did not include a valid publicInput array");
  }

  return {
    countryCommitment: String(publicInput[0]),
    allowlistNumeric: publicInput.slice(1, 9).map((value) => Number(value)).filter((value) => value > 0),
    blocklistNumeric: publicInput.slice(9, 17).map((value) => Number(value)).filter((value) => value > 0),
  };
}

async function verifyZkProofPayload(params: {
  requestBody: z.infer<typeof VerifyZkClaimProofRequestSchema>;
  audience: string;
  trustedIssuerPublicKey: string | null;
  verificationKeys: {
    age: unknown;
    kyc: unknown;
    country: unknown;
  };
}) {
  if (!params.trustedIssuerPublicKey) {
    return {
      statusCode: 503,
      payload: {
        ok: false,
        proofType: "mintra.zk.age-threshold/v1",
        audience: params.audience,
        challengeId: "00000000-0000-0000-0000-000000000000",
        error: {
          code: "trusted_issuer_not_configured",
          message: "Trusted issuer public key is not configured for signed proof bundles",
        },
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  const bundleVerification = verifySignedProofMaterialBundle(
    params.requestBody.proofMaterialBundle,
    params.trustedIssuerPublicKey
  );
  if (!bundleVerification.ok) {
    return {
      statusCode: 400,
      payload: {
        ok: false,
        proofType: "mintra.zk.age-threshold/v1",
        audience: params.audience,
        challengeId: "00000000-0000-0000-0000-000000000000",
        error: bundleVerification.error,
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  const zkPolicyRequest = ZkPolicyRequestSchema.parse(params.requestBody.request);

  if (zkPolicyRequest.audience !== params.audience) {
    return {
      statusCode: 403,
      payload: {
        ok: false,
        proofType: zkPolicyRequest.proofType,
        audience: params.audience,
        challengeId: zkPolicyRequest.challenge.challengeId,
        error: {
          code: "zk_audience_mismatch",
          message: "ZK policy request audience does not match this verifier origin",
        },
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  if (new Date(zkPolicyRequest.challenge.expiresAt).getTime() <= Date.now()) {
    return {
      statusCode: 400,
      payload: {
        ok: false,
        proofType: zkPolicyRequest.proofType,
        audience: params.audience,
        challengeId: zkPolicyRequest.challenge.challengeId,
        error: {
          code: "zk_request_expired",
          message: "ZK policy request has expired",
        },
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  if (zkPolicyRequest.proofType === "mintra.zk.age-threshold/v1") {
    const verified = await verifyJsonProof(params.requestBody.proof as never, params.verificationKeys.age);
    const publicInput = toAgePublicInputFromRawProof(params.requestBody.proof);
    const expectedDobCommitment =
      bundleVerification.bundle.proofMaterial.credentialMetadata.sourceCommitments[
        zkPolicyRequest.publicInputs.commitmentKey
      ]?.value;

    if (
      publicInput.minAge !== zkPolicyRequest.requirements.ageGte ||
      publicInput.referenceDate !== zkPolicyRequest.publicInputs.referenceDate
    ) {
      return {
        statusCode: 400,
        payload: {
          ok: false,
          proofType: zkPolicyRequest.proofType,
          audience: params.audience,
          challengeId: zkPolicyRequest.challenge.challengeId,
          publicInput,
          error: {
            code: "zk_public_input_mismatch",
            message: "Proof public inputs do not match the requested zk policy",
          },
          verifiedAt: new Date().toISOString(),
        },
      };
    }

    if (!expectedDobCommitment || publicInput.dobCommitment !== expectedDobCommitment) {
      return {
        statusCode: 400,
        payload: {
          ok: false,
          proofType: zkPolicyRequest.proofType,
          audience: params.audience,
          challengeId: zkPolicyRequest.challenge.challengeId,
          publicInput,
          error: {
            code: "zk_bundle_commitment_mismatch",
            message: "Proof commitment does not match the signed Mintra proof bundle",
          },
          verifiedAt: new Date().toISOString(),
        },
      };
    }

    return {
      statusCode: 200,
      payload: {
        ok: verified,
        proofType: zkPolicyRequest.proofType,
        audience: params.audience,
        challengeId: zkPolicyRequest.challenge.challengeId,
        publicInput,
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  if (zkPolicyRequest.proofType === "mintra.zk.kyc-passed/v1") {
    const verified = await verifyJsonProof(params.requestBody.proof as never, params.verificationKeys.kyc);
    const publicInput = toKycPublicInputFromRawProof(params.requestBody.proof);
    const expectedKycCommitment =
      bundleVerification.bundle.proofMaterial.credentialMetadata.sourceCommitments[
        zkPolicyRequest.publicInputs.commitmentKey
      ]?.value;

    if (!expectedKycCommitment || publicInput.kycCommitment !== expectedKycCommitment) {
      return {
        statusCode: 400,
        payload: {
          ok: false,
          proofType: zkPolicyRequest.proofType,
          audience: params.audience,
          challengeId: zkPolicyRequest.challenge.challengeId,
          publicInput,
          error: {
            code: "zk_bundle_commitment_mismatch",
            message: "Proof commitment does not match the signed Mintra proof bundle",
          },
          verifiedAt: new Date().toISOString(),
        },
      };
    }

    return {
      statusCode: 200,
      payload: {
        ok: verified,
        proofType: zkPolicyRequest.proofType,
        audience: params.audience,
        challengeId: zkPolicyRequest.challenge.challengeId,
        publicInput,
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  const verified = await verifyJsonProof(params.requestBody.proof as never, params.verificationKeys.country);
  const publicInput = toCountryPublicInputFromRawProof(params.requestBody.proof);
  const expectedCountryCommitment =
    bundleVerification.bundle.proofMaterial.credentialMetadata.sourceCommitments[
      zkPolicyRequest.publicInputs.commitmentKey
    ]?.value;

  if (
    JSON.stringify(publicInput.allowlistNumeric) !== JSON.stringify(zkPolicyRequest.publicInputs.allowlistNumeric) ||
    JSON.stringify(publicInput.blocklistNumeric) !== JSON.stringify(zkPolicyRequest.publicInputs.blocklistNumeric)
  ) {
    return {
      statusCode: 400,
      payload: {
        ok: false,
        proofType: zkPolicyRequest.proofType,
        audience: params.audience,
        challengeId: zkPolicyRequest.challenge.challengeId,
        publicInput,
        error: {
          code: "zk_public_input_mismatch",
          message: "Proof public inputs do not match the requested zk policy",
        },
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  if (!expectedCountryCommitment || publicInput.countryCommitment !== expectedCountryCommitment) {
    return {
      statusCode: 400,
      payload: {
        ok: false,
        proofType: zkPolicyRequest.proofType,
        audience: params.audience,
        challengeId: zkPolicyRequest.challenge.challengeId,
        publicInput,
        error: {
          code: "zk_bundle_commitment_mismatch",
          message: "Proof commitment does not match the signed Mintra proof bundle",
        },
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  return {
    statusCode: 200,
    payload: {
      ok: verified,
      proofType: zkPolicyRequest.proofType,
      audience: params.audience,
      challengeId: zkPolicyRequest.challenge.challengeId,
      publicInput,
      verifiedAt: new Date().toISOString(),
    },
  };
}

function verifySignedProofMaterialBundle(
  bundle: z.infer<typeof SignedZkProofMaterialBundleSchema>,
  trustedIssuerPublicKey: string
) {
  if (bundle.issuerPublicKey !== trustedIssuerPublicKey) {
    return {
      ok: false as const,
      error: {
        code: "zk_bundle_untrusted_issuer",
        message: "Proof bundle issuer does not match the trusted Mintra issuer",
      },
    };
  }

  if (bundle.walletAddress !== bundle.proofMaterial.userId) {
    return {
      ok: false as const,
      error: {
        code: "zk_bundle_wallet_mismatch",
        message: "Proof bundle wallet address does not match the embedded proof owner",
      },
    };
  }

  const signer = new MinaSigner({ network: "mainnet" });
  const verified = signer.verifyMessage({
    publicKey: bundle.issuerPublicKey,
    data: canonicalizeZkProofMaterialBundlePayload({
      version: bundle.version,
      walletAddress: bundle.walletAddress,
      issuerPublicKey: bundle.issuerPublicKey,
      issuedAt: bundle.issuedAt,
      proofMaterial: bundle.proofMaterial,
    }),
    signature: bundle.issuerSignature,
  });

  if (!verified) {
    return {
      ok: false as const,
      error: {
        code: "zk_bundle_invalid_signature",
        message: "Proof bundle signature verification failed",
      },
    };
  }

  return { ok: true as const, bundle };
}

function readTrustSourceMode(value: string | undefined): TrustSourceMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "registry" || normalized === "env" || normalized === "auto") {
    return normalized;
  }
  return "auto";
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
