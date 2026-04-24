import { MintraAgeGate } from "../src/contract.js";

void (async () => {
  console.log("Compiling MintraAgeGate...");
  const { verificationKey } = await MintraAgeGate.compile();
  console.log("Contract compile succeeded.");
  console.log("Verification key hash:", verificationKey.hash.toString());
})().catch((error: unknown) => {
  console.error("MintraAgeGate compile failed.");
  console.error(error);
  process.exit(1);
});
