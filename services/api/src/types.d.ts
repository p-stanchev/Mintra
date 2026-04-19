import type { InMemoryStore } from "./store";
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
    store: InMemoryStore;
    diditProvider: DiditProvider;
    minaBridge: MinaBridgeLike | null;
  }
}
