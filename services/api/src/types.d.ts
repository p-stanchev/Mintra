import type { CredentialMetadata, CredentialTrust } from "@mintra/sdk-types";
import type { VerificationStore } from "./store";
import type { DiditProvider } from "@mintra/provider-didit";
import type { WalletAuthStore } from "./auth";

interface MinaBridgeLike {
  issueCredential(req: {
    userId: string;
    claims: Record<string, unknown>;
    ownerPublicKey: string;
    credentialMetadata?: CredentialMetadata;
  }): Promise<{ credentialJson: string; issuerPublicKey: string; credentialMetadata?: CredentialMetadata }>;
}

declare module "fastify" {
  interface FastifyInstance {
    store: VerificationStore;
    authStore: WalletAuthStore;
    diditProvider: DiditProvider;
    minaBridge: MinaBridgeLike | null;
    allowedCallbackOrigins: string[];
    authAllowedOrigins: string[];
    credentialTrustDefaults: CredentialTrust;
  }

  interface FastifyRequest {
    authWalletAddress?: string;
    authWalletIsFresh?: boolean;
  }
}
