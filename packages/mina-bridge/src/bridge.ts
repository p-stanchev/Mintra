import type { MinaIssuanceRequest, MinaIssuanceResult } from "@mintra/sdk-types";
import { claimsToCredentialData } from "./mapping";

// Dynamic imports keep o1js/mina-attestations out of the initial load path.
// Both are large and have significant startup cost from snark compilation.
async function loadMina() {
  const [{ Credential, createNative }, { Field, PrivateKey, PublicKey }] = await Promise.all([
    import("mina-attestations").then((m) => ({
      Credential: m.Credential,
      // createNative is an internal helper — we use Credential.Native which wraps it
      createNative: m.Credential.Native as unknown as {
        create?: unknown;
      } & ((dataType: unknown) => unknown),
    })),
    import("o1js"),
  ]);
  return { Credential, Field, PrivateKey, PublicKey };
}

export interface MinaBridgeConfig {
  issuerPrivateKey: string; // Base58 Mina private key
}

export class MinaBridge {
  private readonly privateKeyBase58: string;

  constructor(config: MinaBridgeConfig) {
    this.privateKeyBase58 = config.issuerPrivateKey;
  }

  async getIssuerPublicKey(): Promise<string> {
    const { PrivateKey } = await loadMina();
    return PrivateKey.fromBase58(this.privateKeyBase58).toPublicKey().toBase58();
  }

  async issueCredential(request: MinaIssuanceRequest): Promise<MinaIssuanceResult> {
    // mina-attestations 0.5.x API:
    //   createNative(issuerPrivateKey, { owner: PublicKey, data: {...Fields} })
    //   returns a StoredCredential (native type)
    //   Credential.toJSON(storedCredential) → string
    const { Credential, Field, PrivateKey, PublicKey } = await loadMina();

    // Import createNative from the credential-native module directly
    const { createNative } = await import(
      "mina-attestations/build/src/credential-native.js" as string
    ).catch(() => {
      // Fallback: re-export from credential-index
      return { createNative: null };
    });

    const issuerKey = PrivateKey.fromBase58(this.privateKeyBase58);
    const owner = PublicKey.fromBase58(request.ownerPublicKey);
    const credData = claimsToCredentialData(
      request.claims,
      Math.floor(Date.now() / 1000)
    );

    const data = {
      ageOver18: Field(credData.ageOver18),
      kycPassed: Field(credData.kycPassed),
      countryCode: Field(credData.countryCode),
      issuedAt: Field(credData.issuedAt),
    };

    // createNative(issuerPrivateKey, credential { owner, data }, metadata?)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createFn = (createNative ?? (Credential as any).createNative) as (
      key: typeof issuerKey,
      cred: { owner: typeof owner; data: typeof data }
    ) => unknown;

    const storedCredential = createFn(issuerKey, { owner, data });

    // Credential.toJSON serializes the StoredCredential to a JSON string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const credentialJson = (Credential as any).toJSON(storedCredential) as string;
    const issuerPublicKey = issuerKey.toPublicKey().toBase58();

    return { credentialJson, issuerPublicKey };
  }
}

export function createMinaBridge(config: MinaBridgeConfig): MinaBridge {
  return new MinaBridge(config);
}
