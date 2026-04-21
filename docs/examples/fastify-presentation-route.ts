import Fastify from "fastify";
import { createRequire } from "node:module";
import {
  createPresentationRequest,
  verifyPresentation,
} from "@mintra/verifier-core";
import type { PresentationEnvelope } from "@mintra/sdk-types";

const app = Fastify();
const nodeRequire = createRequire(import.meta.url);
const MinaSigner = nodeRequire("mina-signer");
const signers = [
  new MinaSigner({ network: "mainnet" }),
  new MinaSigner({ network: "testnet" }),
];

app.post("/api/mintra/request", async (request) => {
  const origin = request.headers.origin ?? "https://example.com";
  return createPresentationRequest({
    proofProductId: "proof_of_age_18",
    audience: origin,
    verifier: "https://verifier.example.com",
  });
});

app.post("/api/mintra/verify", async (request, reply) => {
  const body = request.body as {
    presentationEnvelope: PresentationEnvelope;
    expectedOwnerPublicKey?: string;
  };
  const origin = request.headers.origin ?? "https://example.com";

  const result = await verifyPresentation({
    envelope: body.presentationEnvelope,
    verifierIdentity: origin,
    expectedAudience: origin,
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
