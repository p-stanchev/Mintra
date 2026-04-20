import type { VerificationStore } from "./store";
import type { DiditProvider } from "@mintra/provider-didit";
import type { WalletAuthStore } from "./auth";

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
    authStore: WalletAuthStore;
    diditProvider: DiditProvider;
    minaBridge: MinaBridgeLike | null;
    allowedCallbackOrigins: string[];
  }

  interface FastifyRequest {
    authWalletAddress?: string;
  }
}
