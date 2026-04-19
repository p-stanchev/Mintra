import type { VerificationStore } from "./store";
import type { DiditProvider } from "@mintra/provider-didit";

interface MinaBridgeLike {
  issueCredential(req: {
    userId: string;
    claims: Record<string, unknown>;
    ownerPublicKey: string;
  }): Promise<{ credentialJson: string; issuerPublicKey: string }>;
}

declare module "fastify" {
  interface FastifyInstance {
    store: VerificationStore;
    diditProvider: DiditProvider;
    minaBridge: MinaBridgeLike | null;
  }
}
