#!/usr/bin/env node
// Compiles all Mintra ZkPrograms and prints their verification key hashes.
// Run: node --import tsx/esm scripts/print-vk-hashes.ts  (from packages/zk-claims)
//
// Compilation takes 30–120 s per program. The hash is stable for a given
// circuit and changes only when circuit constraints change.

// Import directly from circuit files to avoid loading contract.ts at eval time
// (SmartContract decorators require emitDecoratorMetadata, which esbuild/tsx doesn't emit)
import { compileAgeClaimProgram } from "../src/age.js";
import { compileKycPassedProgram } from "../src/kyc.js";
import { compileCountryMembershipProgram } from "../src/country.js";

void (async () => {
  process.stderr.write("Compiling AgeClaimProgram…\n");
  const age = await compileAgeClaimProgram();

  process.stderr.write("Compiling KycPassedProgram…\n");
  const kyc = await compileKycPassedProgram();

  process.stderr.write("Compiling CountryMembershipProgram…\n");
  const country = await compileCountryMembershipProgram();

  const registry = {
    "mintra.zk.age-threshold/v1": {
      hash: age.verificationKey.hash.toString(),
      data: age.verificationKey.data,
    },
    "mintra.zk.kyc-passed/v1": {
      hash: kyc.verificationKey.hash.toString(),
      data: kyc.verificationKey.data,
    },
    "mintra.zk.country-membership/v1": {
      hash: country.verificationKey.hash.toString(),
      data: country.verificationKey.data,
    },
  };

  process.stdout.write(JSON.stringify(registry, null, 2) + "\n");
})();
