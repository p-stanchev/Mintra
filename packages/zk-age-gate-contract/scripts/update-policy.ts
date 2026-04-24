import { Bool, Mina, PrivateKey, PublicKey, UInt32 } from "o1js";
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
  const zkAppAddressBase58 = requiredEnv("ZKAPP_ADDRESS");
  const graphqlUrl = requiredEnv("MINA_GRAPHQL_URL");
  const archiveUrl = process.env["MINA_ARCHIVE_URL"];
  const minAge = Number(process.env["MIN_AGE"] ?? "18");
  const requireKycPassed = /^(1|true|yes)$/i.test(process.env["REQUIRE_KYC_PASSED"] ?? "false");

  if (!Number.isInteger(minAge) || minAge < 0) {
    throw new Error("MIN_AGE must be a non-negative integer.");
  }

  const deployer = PrivateKey.fromBase58(deployerPrivKey);
  const zkAppKey = PrivateKey.fromBase58(zkAppPrivKey);
  const deployerAccount = deployer.toPublicKey();

  const network = Mina.Network({
    mina: graphqlUrl,
    ...(archiveUrl ? { archive: archiveUrl } : {}),
  });
  Mina.setActiveInstance(network);

  console.log("Deployer:", deployerAccount.toBase58());
  console.log("zkApp:   ", zkAppAddressBase58);
  console.log("GraphQL: ", graphqlUrl);
  console.log("Min age: ", minAge);
  console.log("Require KYC:", requireKycPassed);

  const { verificationKey: ageVerificationKey } = await compileAgeClaimProgram();
  const { verificationKey: kycVerificationKey } = await compileKycPassedProgram();
  const zkApp = new MintraAgeGate(PublicKey.fromBase58(zkAppAddressBase58));

  const tx = await Mina.transaction(
    { sender: deployerAccount, fee: 0.1e9 },
    async () => {
      await zkApp.updatePolicy(
        ageVerificationKey,
        kycVerificationKey,
        UInt32.from(minAge),
        Bool(requireKycPassed)
      );
    }
  );

  await tx.prove();
  const result = await tx.sign([deployer, zkAppKey]).send();
  console.log("Policy update tx hash:", result.hash);
  await result.wait();
  console.log("Updated policy:", { minAge, requireKycPassed });
})().catch((error: unknown) => {
  console.error("MintraAgeGate policy update failed.");
  console.error(error);
  process.exit(1);
});
