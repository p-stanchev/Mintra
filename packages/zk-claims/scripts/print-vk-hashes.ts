#!/usr/bin/env node
// Compiles all Mintra ZkPrograms and prints their verification key hashes.
// Run once after any circuit change and commit the output so the MintraAgeGate
// contract can be initialized with the correct on-chain VK hash.
//
// Usage: npx tsx scripts/print-vk-hashes.ts
//
// Compilation takes 30–120 seconds per program. The resulting hash is stable
// for a given circuit; it changes only when the circuit constraints change.

import {
  compileAgeClaimProgram,
  compileKycPassedProgram,
  compileCountryMembershipProgram,
} from "../src/index.js";

console.error("Compiling AgeClaimProgram…");
const age = await compileAgeClaimProgram();

console.error("Compiling KycPassedProgram…");
const kyc = await compileKycPassedProgram();

console.error("Compiling CountryMembershipProgram…");
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

console.log(JSON.stringify(registry, null, 2));
