import { promises as fs } from "node:fs";
import path from "node:path";
import { Field, Mina, PrivateKey, PublicKey } from "o1js";
import {
  compileAgeClaimProgram,
  compileCountryMembershipProgram,
  compileKycPassedProgram,
} from "@mintra/zk-claims";
import { MintraRegistry } from "../src/registry.js";
import {
  computeRegistryRoots,
  normalizeRegistryAttestationState,
  setRevocationStatus,
  upsertCredentialCommitment,
  type RegistryAttestationState,
} from "../src/attestations.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readStateFilePath(): string {
  return path.resolve(
    process.cwd(),
    process.env["REGISTRY_ATTESTATIONS_FILE"] ?? ".mintra/registry-attestations.json"
  );
}

void (async () => {
  const deployer = PrivateKey.fromBase58(requiredEnv("DEPLOYER_PRIVATE_KEY"));
  const zkAppKey = PrivateKey.fromBase58(requiredEnv("ZKAPP_PRIVATE_KEY"));
  const zkAppAddress = PublicKey.fromBase58(requiredEnv("ZKAPP_ADDRESS"));
  const graphqlUrl = requiredEnv("MINA_GRAPHQL_URL");
  const issuerPublicKey = PublicKey.fromBase58(requiredEnv("TRUSTED_ISSUER_PUBLIC_KEY"));
  const commitment = requiredEnv("ATTESTATION_COMMITMENT").trim().toLowerCase();
  const archiveUrl = process.env["MINA_ARCHIVE_URL"];
  const stateFile = readStateFilePath();

  const state = await readState(stateFile);
  const updated = setRevocationStatus(
    upsertCredentialCommitment(state, commitment),
    commitment,
    false
  );
  await writeState(stateFile, updated);

  const roots = await computeRegistryRoots(updated);
  const network = Mina.Network({ mina: graphqlUrl, ...(archiveUrl ? { archive: archiveUrl } : {}) });
  Mina.setActiveInstance(network);

  const { verificationKey: ageVerificationKey } = await compileAgeClaimProgram();
  const { verificationKey: kycVerificationKey } = await compileKycPassedProgram();
  const { verificationKey: countryVerificationKey } = await compileCountryMembershipProgram();
  const registry = new MintraRegistry(zkAppAddress);

  const tx = await Mina.transaction({ sender: deployer.toPublicKey(), fee: 0.1e9 }, async () => {
    await registry.updateTrustAnchors(
      issuerPublicKey,
      ageVerificationKey,
      kycVerificationKey,
      countryVerificationKey,
      roots.credentialRootField,
      roots.revocationRootField
    );
  });
  await tx.prove();
  const result = await tx.sign([deployer, zkAppKey]).send();
  console.log("Published attestation commitment:", commitment);
  console.log("credentialRoot:", roots.credentialRootHex);
  console.log("revocationRoot:", roots.revocationRootHex);
  console.log("Registry update tx hash:", result.hash);
  await result.wait();
})().catch((error: unknown) => {
  console.error("Registry attestation publish failed.");
  console.error(error);
  process.exit(1);
});

async function readState(filePath: string): Promise<RegistryAttestationState> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return normalizeRegistryAttestationState(JSON.parse(raw) as Partial<RegistryAttestationState>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return normalizeRegistryAttestationState({});
    }
    throw error;
  }
}

async function writeState(filePath: string, state: RegistryAttestationState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}
