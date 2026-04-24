import { MintraAgeGate } from "../src/contract.js";
import { MintraRegistry } from "../src/registry.js";

void (async () => {
  console.log("Compiling MintraRegistry...");
  const { verificationKey: registryVerificationKey } = await MintraRegistry.compile();
  console.log("MintraRegistry compile succeeded.");
  console.log("Registry verification key hash:", registryVerificationKey.hash.toString());

  console.log("\nCompiling MintraAgeGate...");
  const { verificationKey: ageGateVerificationKey } = await MintraAgeGate.compile();
  console.log("MintraAgeGate compile succeeded.");
  console.log("Age gate verification key hash:", ageGateVerificationKey.hash.toString());
})().catch((error: unknown) => {
  console.error("Mintra contract compile failed.");
  console.error(error);
  process.exit(1);
});
