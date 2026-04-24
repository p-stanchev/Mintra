import { AccountUpdate, Field, Mina, Permissions, PrivateKey, PublicKey } from "o1js";
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
  const graphqlUrl = requiredEnv("MINA_GRAPHQL_URL");
  const issuerPublicKeyBase58 = requiredEnv("TRUSTED_ISSUER_PUBLIC_KEY");
  const archiveUrl = process.env["MINA_ARCHIVE_URL"];
  const credentialRoot = readRoot("CREDENTIAL_ROOT");
  const revocationRoot = readRoot("REVOCATION_ROOT");

  const deployer = PrivateKey.fromBase58(deployerPrivKey);
  const zkAppKey = PrivateKey.fromBase58(zkAppPrivKey);
  const zkAppAddress = zkAppKey.toPublicKey();
  const deployerAccount = deployer.toPublicKey();
  const issuerPublicKey = PublicKey.fromBase58(issuerPublicKeyBase58);

  const network = Mina.Network({
    mina: graphqlUrl,
    ...(archiveUrl ? { archive: archiveUrl } : {}),
  });
  Mina.setActiveInstance(network);

  console.log("Deployer:", deployerAccount.toBase58());
  console.log("Registry: ", zkAppAddress.toBase58());
  console.log("Issuer:   ", issuerPublicKey.toBase58());
  console.log("GraphQL:  ", graphqlUrl);

  console.log("\n[1/5] Compiling off-chain proof programs...");
  const { verificationKey: ageVerificationKey } = await compileAgeClaimProgram();
  const { verificationKey: kycVerificationKey } = await compileKycPassedProgram();
  const { verificationKey: countryVerificationKey } = await compileCountryMembershipProgram();
  console.log("      Age VK hash:    ", ageVerificationKey.hash.toString());
  console.log("      KYC VK hash:    ", kycVerificationKey.hash.toString());
  console.log("      Country VK hash:", countryVerificationKey.hash.toString());

  console.log("[2/5] Compiling MintraRegistry contract...");
  const { verificationKey: registryVerificationKey } = await MintraRegistry.compile();
  console.log("      Registry VK hash:", registryVerificationKey.hash.toString());

  const registry = new MintraRegistry(zkAppAddress);

  console.log("[3/5] Deploying registry...");
  const deployTx = await Mina.transaction(
    { sender: deployerAccount, fee: 0.1e9 },
    async () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      await registry.deploy({
        verificationKey: registryVerificationKey,
      });
      registry.account.permissions.set({
        ...Permissions.default(),
        editState: Permissions.proofOrSignature(),
      });
    }
  );
  await deployTx.prove();
  const deployResult = await deployTx.sign([deployer, zkAppKey]).send();
  console.log("      Deploy tx hash:", deployResult.hash);
  await deployResult.wait();

  console.log("[4/5] Initializing trust anchors...");
  const initTx = await Mina.transaction(
    { sender: deployerAccount, fee: 0.1e9 },
    async () => {
      await registry.initialize(
        issuerPublicKey,
        ageVerificationKey,
        kycVerificationKey,
        countryVerificationKey,
        credentialRoot,
        revocationRoot
      );
    }
  );
  await initTx.prove();
  const initResult = await initTx.sign([deployer, zkAppKey]).send();
  console.log("      Init tx hash:", initResult.hash);
  await initResult.wait();

  console.log("[5/5] Done.");
  console.log("Registry address:", zkAppAddress.toBase58());
  console.log("Set NEXT_PUBLIC_MINTRA_ZKAPP_REGISTRY_ADDRESS=" + zkAppAddress.toBase58());
})().catch((error: unknown) => {
  console.error("MintraRegistry deployment failed.");
  console.error(error);
  process.exit(1);
});
