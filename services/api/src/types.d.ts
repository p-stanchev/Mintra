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

interface MinaPresentationVerifierLike {
  buildAgeOver18PresentationRequest(action?: string): Promise<unknown>;
  parseHttpsPresentationRequest(presentationRequestJson: string): Promise<unknown>;
  verifyAgeOver18Presentation(params: {
    request: unknown;
    presentationJson: string;
    verifierIdentity: string;
  }): Promise<unknown>;
}

declare module "fastify" {
  interface FastifyInstance {
    store: VerificationStore;
    authStore: WalletAuthStore;
    diditProvider: DiditProvider;
    minaBridge: MinaBridgeLike | null;
    minaPresentationVerifier: MinaPresentationVerifierLike | null;
    allowedCallbackOrigins: string[];
    authAllowedOrigins: string[];
  }

  interface FastifyRequest {
    authWalletAddress?: string;
    authWalletIsFresh?: boolean;
  }
}
