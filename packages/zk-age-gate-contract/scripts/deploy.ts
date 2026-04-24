import { Bool, Mina, PrivateKey, UInt32 } from "o1js";
import { compileAgeClaimProgram, compileKycPassedProgram } from "@mintra/zk-claims";
import { MintraAgeGate } from "../src/contract.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

void (async () => {
  const deployerPrivKey = requiredEnv("DEPLOYER_PRIVATE_KEY");
  const zkAppPrivKey = requiredEnv("ZKAPP_PRIVATE_KEY");
  const graphqlUrl = requiredEnv("MINA_GRAPHQL_URL");
  const archiveUrl = process.env["MINA_ARCHIVE_URL"];
  const minAge = Number(process.env["MIN_AGE"] ?? "18");
  const requireKycPassed = /^(1|true|yes)$/i.test(process.env["REQUIRE_KYC_PASSED"] ?? "false");

  if (!Number.isInteger(minAge) || minAge < 0) {
    throw new Error("MIN_AGE must be a non-negative integer.");
  }

  const deployer = PrivateKey.fromBase58(deployerPrivKey);
  const zkAppKey = PrivateKey.fromBase58(zkAppPrivKey);
  const zkAppAddress = zkAppKey.toPublicKey();
  const deployerAccount = deployer.toPublicKey();

  const network = Mina.Network({
    mina: graphqlUrl,
    ...(archiveUrl ? { archive: archiveUrl } : {}),
  });
  Mina.setActiveInstance(network);

  console.log("Deployer:", deployerAccount.toBase58());
  console.log("zkApp:   ", zkAppAddress.toBase58());
  console.log("GraphQL: ", graphqlUrl);
  if (archiveUrl) {
    console.log("Archive: ", archiveUrl);
  }
  console.log("Min age: ", minAge);
  console.log("Require KYC:", requireKycPassed);

  console.log("\n[1/4] Compiling AgeClaimProgram...");
  const { verificationKey: ageVerificationKey } = await compileAgeClaimProgram();
  console.log("      Age proof VK hash:", ageVerificationKey.hash.toString());

  console.log("[1.5/4] Compiling KycPassedProgram...");
  const { verificationKey: kycVerificationKey } = await compileKycPassedProgram();
  console.log("      KYC proof VK hash:", kycVerificationKey.hash.toString());

  console.log("[2/4] Compiling MintraAgeGate contract...");
  const { verificationKey: contractVerificationKey } = await MintraAgeGate.compile();
  console.log("      Contract VK hash: ", contractVerificationKey.hash.toString());

  const zkApp = new MintraAgeGate(zkAppAddress);

  console.log("[3/4] Deploying contract...");
  const deployTx = await Mina.transaction(
    { sender: deployerAccount, fee: 0.1e9 },
    async () => {
      await zkApp.deploy({
        verificationKey: contractVerificationKey,
      });
    }
  );
  await deployTx.prove();
  const deployResult = await deployTx.sign([deployer, zkAppKey]).send();
  console.log("      Deploy tx hash:", deployResult.hash);
  await deployResult.wait();

  console.log("[4/4] Initializing age gate policy...");
  const initTx = await Mina.transaction(
    { sender: deployerAccount, fee: 0.1e9 },
    async () => {
      await zkApp.initialize(
        ageVerificationKey,
        kycVerificationKey,
        UInt32.from(minAge),
        Bool(requireKycPassed)
      );
    }
  );
  await initTx.prove();
  const initResult = await initTx.sign([deployer]).send();
  console.log("      Init tx hash:", initResult.hash);
  await initResult.wait();

  console.log("\nDone.");
  console.log("zkApp address:", zkAppAddress.toBase58());
  console.log("Configured policy:", {
    minAge,
    requireKycPassed,
  });
  console.log("Set NEXT_PUBLIC_MINTRA_ZKAPP_ADDRESS=" + zkAppAddress.toBase58());
})().catch((error: unknown) => {
  console.error("MintraAgeGate deployment failed.");
  console.error(error);
  process.exit(1);
});
