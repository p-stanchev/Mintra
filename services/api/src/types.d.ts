import type { CredentialMetadata, CredentialTrust } from "@mintra/sdk-types";
import type { VerificationStore } from "./store";
import type { DiditProvider } from "@mintra/provider-didit";
import type { IdNormProvider } from "@mintra/provider-idnorm";
import type { WalletAuthStore } from "./auth";
import type { VerificationProvider, VerificationProviderId } from "@mintra/sdk-types";

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
    diditProvider: DiditProvider | null;
    idnormProvider: IdNormProvider | null;
    verificationProviders: Partial<Record<VerificationProviderId, VerificationProvider>>;
    defaultVerificationProviderId: VerificationProviderId | null;
    minaBridge: MinaBridgeLike | null;
    minaIssuerPrivateKey: string | null;
    minaIssuerPublicKey: string | null;
    allowedCallbackOrigins: string[];
    authAllowedOrigins: string[];
    credentialTrustDefaults: CredentialTrust;
  }

  interface FastifyRequest {
    authWalletAddress?: string;
    authWalletIsFresh?: boolean;
  }
}
