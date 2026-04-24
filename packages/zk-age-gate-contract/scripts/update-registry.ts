import { Field, Mina, PrivateKey, PublicKey } from "o1js";
import {
  compileAgeClaimProgram,
  compileCountryMembershipProgram,
  compileKycPassedProgram,
} from "@mintra/zk-claims";
import { MintraRegistry } from "../src/registry.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readRoot(name: string): Field {
  const raw = process.env[name];
  return Field(raw ?? 0);
}

void (async () => {
  const deployerPrivKey = requiredEnv("DEPLOYER_PRIVATE_KEY");
  const zkAppPrivKey = requiredEnv("ZKAPP_PRIVATE_KEY");
  const zkAppAddressBase58 = requiredEnv("ZKAPP_ADDRESS");
  const graphqlUrl = requiredEnv("MINA_GRAPHQL_URL");
  const issuerPublicKeyBase58 = requiredEnv("TRUSTED_ISSUER_PUBLIC_KEY");
  const archiveUrl = process.env["MINA_ARCHIVE_URL"];
  const credentialRoot = readRoot("CREDENTIAL_ROOT");
  const revocationRoot = readRoot("REVOCATION_ROOT");

  const deployer = PrivateKey.fromBase58(deployerPrivKey);
  const zkAppKey = PrivateKey.fromBase58(zkAppPrivKey);
  const deployerAccount = deployer.toPublicKey();
  const issuerPublicKey = PublicKey.fromBase58(issuerPublicKeyBase58);

  const network = Mina.Network({
    mina: graphqlUrl,
    ...(archiveUrl ? { archive: archiveUrl } : {}),
  });
  Mina.setActiveInstance(network);

  const { verificationKey: ageVerificationKey } = await compileAgeClaimProgram();
  const { verificationKey: kycVerificationKey } = await compileKycPassedProgram();
  const { verificationKey: countryVerificationKey } = await compileCountryMembershipProgram();
  const registry = new MintraRegistry(PublicKey.fromBase58(zkAppAddressBase58));

  const tx = await Mina.transaction(
    { sender: deployerAccount, fee: 0.1e9 },
    async () => {
      await registry.updateTrustAnchors(
        issuerPublicKey,
        ageVerificationKey,
        kycVerificationKey,
        countryVerificationKey,
        credentialRoot,
        revocationRoot
      );
    }
  );
  await tx.prove();
  const result = await tx.sign([deployer, zkAppKey]).send();
  console.log("Registry update tx hash:", result.hash);
  await result.wait();
  console.log("Updated registry:", {
    issuerPublicKey: issuerPublicKey.toBase58(),
    credentialRoot: credentialRoot.toString(),
    revocationRoot: revocationRoot.toString(),
  });
})().catch((error: unknown) => {
  console.error("MintraRegistry update failed.");
  console.error(error);
  process.exit(1);
});
