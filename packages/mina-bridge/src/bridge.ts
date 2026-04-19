import type { MinaIssuanceRequest, MinaIssuanceResult } from "@mintra/sdk-types";
import { claimsToCredentialData } from "./mapping";

// Dynamic imports keep o1js/mina-attestations out of the initial load path.
// Both are large and have significant startup cost from snark compilation.
async function loadMina() {
  const [{ Credential }, { Field, PrivateKey, PublicKey }] = await Promise.all([
    import("mina-attestations").then((m) => ({
      Credential: m.Credential,
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
    //   Credential.sign(issuerPrivateKey, { owner: PublicKey, data: {...Fields} })
    //   returns a StoredCredential (native type)
    //   Credential.toJSON(storedCredential) → string
    const { Credential, Field, PrivateKey, PublicKey } = await loadMina();

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

    // Credential.sign(issuerPrivateKey, credential { owner, data }, metadata?)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signFn = (Credential as any).sign as (
      key: typeof issuerKey,
      cred: { owner: typeof owner; data: typeof data }
    ) => unknown;

    if (typeof signFn !== "function") {
      throw new Error("mina-attestations Credential.sign API is unavailable");
    }

    const storedCredential = signFn(issuerKey, { owner, data });

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
