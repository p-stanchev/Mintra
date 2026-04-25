import Fastify from "fastify";
import { createRequire } from "node:module";
import { z } from "zod";
import {
  createPresentationRequest,
  verifyPresentation,
} from "@mintra/verifier-core";
import { PresentationEnvelopeSchema } from "@mintra/sdk-types";

const app = Fastify();
const nodeRequire = createRequire(import.meta.url);
const MinaSigner = nodeRequire("mina-signer");
const appOrigin = process.env.APP_ORIGIN ?? "https://app.example.com";
const verifierOrigin = process.env.VERIFIER_ORIGIN ?? "https://verifier.example.com";
const signers = [
  new MinaSigner({ network: "mainnet" }),
  new MinaSigner({ network: "testnet" }),
];

const VerifyBodySchema = z.object({
  presentationEnvelope: PresentationEnvelopeSchema,
  expectedOwnerPublicKey: z.string().optional(),
});

app.post("/api/mintra/request", async (request) => {
  return createPresentationRequest({
    proofProductId: "proof_of_age_18",
    audience: appOrigin,
    verifier: verifierOrigin,
  });
});

app.post("/api/mintra/verify", async (request, reply) => {
  const body = VerifyBodySchema.parse(request.body);

  const result = await verifyPresentation({
    envelope: body.presentationEnvelope,
    verifierIdentity: verifierOrigin,
    expectedAudience: appOrigin,
    holderBindingVerifier: {
      verifyMessage(input) {
        return signers.some((signer) =>
          signer.verifyMessage({
            publicKey: input.publicKey,
            data: input.data,
            signature: input.signature,
          })
        );
      },
    },
    ...(body.expectedOwnerPublicKey === undefined
      ? {}
      : { expectedOwnerPublicKey: body.expectedOwnerPublicKey }),
  });

  if (!result.ok) {
    return reply.status(403).send(result);
  }

  return result;
});
