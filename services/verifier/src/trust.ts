import { Field, PublicKey } from "o1js";

export type TrustSourceMode = "auto" | "registry" | "env";
export type ResolvedTrustSource = "registry" | "env" | "unconfigured";

export interface VerificationKeyHashes {
  age: string;
  kyc: string;
  country: string;
}

export interface RegistryTrustAnchors {
  address: string;
  graphqlUrl: string;
  nonce: string;
  permissionsEditState: string;
  issuerPublicKey: string;
  ageVkHash: string;
  kycVkHash: string;
  countryVkHash: string;
  credentialRoot: string;
  revocationRoot: string;
}

export interface VerifierTrustContext {
  source: ResolvedTrustSource;
  trustedIssuerPublicKey: string | null;
  verificationKeyHashes: VerificationKeyHashes;
  registry: RegistryTrustAnchors | null;
  registryError: string | null;
}

export async function resolveVerifierTrustContext(params: {
  mode: TrustSourceMode;
  envTrustedIssuerPublicKey: string | null;
  registryAddress: string | null;
  minaGraphqlUrl: string | null;
  verificationKeyHashes: VerificationKeyHashes;
}): Promise<VerifierTrustContext> {
  const registryConfigured = Boolean(params.registryAddress && params.minaGraphqlUrl);

  if (params.mode !== "env" && registryConfigured) {
    try {
      const registry = await loadRegistryTrustAnchors({
        address: params.registryAddress!,
        graphqlUrl: params.minaGraphqlUrl!,
      });
      assertRegistryMatchesVerificationKeys(registry, params.verificationKeyHashes);
      return {
        source: "registry",
        trustedIssuerPublicKey: registry.issuerPublicKey,
        verificationKeyHashes: params.verificationKeyHashes,
        registry,
        registryError: null,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (params.mode === "registry") {
        throw new Error(`Registry trust resolution failed: ${detail}`);
      }
      if (params.envTrustedIssuerPublicKey) {
        return {
          source: "env",
          trustedIssuerPublicKey: params.envTrustedIssuerPublicKey,
          verificationKeyHashes: params.verificationKeyHashes,
          registry: null,
          registryError: detail,
        };
      }
      return {
        source: "unconfigured",
        trustedIssuerPublicKey: null,
        verificationKeyHashes: params.verificationKeyHashes,
        registry: null,
        registryError: detail,
      };
    }
  }

  if (params.envTrustedIssuerPublicKey) {
    return {
      source: "env",
      trustedIssuerPublicKey: params.envTrustedIssuerPublicKey,
      verificationKeyHashes: params.verificationKeyHashes,
      registry: null,
      registryError: registryConfigured ? "Registry trust mode is disabled by configuration." : null,
    };
  }

  if (params.mode === "registry" && !registryConfigured) {
    throw new Error("Registry trust mode requires MINTRA_REGISTRY_ADDRESS and MINA_GRAPHQL_URL.");
  }

  return {
    source: "unconfigured",
    trustedIssuerPublicKey: null,
    verificationKeyHashes: params.verificationKeyHashes,
    registry: null,
    registryError: registryConfigured ? "Registry trust could not be resolved." : null,
  };
}

async function loadRegistryTrustAnchors(params: {
  address: string;
  graphqlUrl: string;
}): Promise<RegistryTrustAnchors> {
  const response = await fetch(params.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query:
        "query($pk: PublicKey!) { account(publicKey: $pk) { publicKey nonce zkappState permissions { editState } } }",
      variables: {
        pk: params.address,
      },
    }),
  });

  const payload = (await response.json()) as {
    data?: {
      account?: {
        publicKey: string;
        nonce: string;
        zkappState: string[];
        permissions?: {
          editState?: string;
        };
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message ?? `Registry GraphQL request failed with ${response.status}`);
  }

  const account = payload.data?.account;
  if (!account) {
    throw new Error("Registry account was not found on the configured Mina network.");
  }
  if (!Array.isArray(account.zkappState) || account.zkappState.length < 7) {
    throw new Error("Registry account does not expose the expected zkapp state layout.");
  }

  const issuerPublicKey = PublicKey.fromFields([
    Field(account.zkappState[0]),
    Field(account.zkappState[1]),
  ]).toBase58();

  return {
    address: account.publicKey,
    graphqlUrl: params.graphqlUrl,
    nonce: account.nonce,
    permissionsEditState: account.permissions?.editState ?? "Unknown",
    issuerPublicKey,
    ageVkHash: String(account.zkappState[2]),
    kycVkHash: String(account.zkappState[3]),
    countryVkHash: String(account.zkappState[4]),
    credentialRoot: String(account.zkappState[5]),
    revocationRoot: String(account.zkappState[6]),
  };
}

function assertRegistryMatchesVerificationKeys(
  registry: RegistryTrustAnchors,
  verificationKeyHashes: VerificationKeyHashes
) {
  if (registry.ageVkHash !== verificationKeyHashes.age) {
    throw new Error("Registry age VK hash does not match the verifier's compiled age proof program.");
  }
  if (registry.kycVkHash !== verificationKeyHashes.kyc) {
    throw new Error("Registry KYC VK hash does not match the verifier's compiled KYC proof program.");
  }
  if (registry.countryVkHash !== verificationKeyHashes.country) {
    throw new Error("Registry country VK hash does not match the verifier's compiled country proof program.");
  }
}
