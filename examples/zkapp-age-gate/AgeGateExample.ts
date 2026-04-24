// Example: deploying and interacting with MintraAgeGate.
// Run from the monorepo root after building @mintra/zk-claims and @mintra/zk-age-gate-contract.

import { Mina, PrivateKey, UInt32 } from "o1js";
import { MintraAgeGate, AgeClaimDynamicProof } from "@mintra/zk-age-gate-contract";
import {
  compileAgeClaimProgram,
  proveAgeClaimFromCredentialMetadata,
} from "@mintra/zk-claims";
import type { CredentialMetadata } from "@mintra/credential-v2";

async function main() {
  // Use a local blockchain for demonstration
  const Local = await Mina.LocalBlockchain({ proofsEnabled: true });
  Mina.setActiveInstance(Local);

  const deployerKey = Local.testAccounts[0].key;
  const deployerAccount = Local.testAccounts[0];
  const zkAppKey = PrivateKey.random();
  const zkAppAddress = zkAppKey.toPublicKey();

  // 1. Compile the age proof program to obtain its verification key
  const { verificationKey } = await compileAgeClaimProgram();

  // 2. Deploy the MintraAgeGate contract
  const zkApp = new MintraAgeGate(zkAppAddress);
  const deployTx = await Mina.transaction(deployerAccount, async () => {
    await zkApp.deploy();
  });
  await deployTx.prove();
  await deployTx.sign([deployerKey, zkAppKey]).send();

  // 3. Initialize: lock the VK hash and set minAge = 18 on-chain
  const initTx = await Mina.transaction(deployerAccount, async () => {
    await zkApp.initialize(verificationKey, UInt32.from(18));
  });
  await initTx.prove();
  await initTx.sign([deployerKey]).send();

  // 4. Generate an age proof (normally done browser-side from credentialMetadata)
  const credentialMetadata: CredentialMetadata = {
    version: "v2",
    sourceCommitments: {
      /* populated from the Mintra API /api/mina/zk-age-proof-input/:userId */
    },
    derivedClaims: {},
  };

  const proof = await proveAgeClaimFromCredentialMetadata({
    credentialMetadata,
    dateOfBirth: "1990-06-15",
    minAge: 18,
    referenceDate: new Date().toISOString().slice(0, 10),
    // salt: BigInt(`0x${zkSalts.dob}`) — pass the salt returned by the API
  });

  // 5. Wrap the proof in a DynamicProof and submit on-chain
  const dynamicProof = AgeClaimDynamicProof.fromProof(proof);
  const proveTx = await Mina.transaction(deployerAccount, async () => {
    await zkApp.proveAge(dynamicProof, verificationKey);
  });
  await proveTx.prove();
  await proveTx.sign([deployerKey]).send();

  console.log("Age gate passed — transaction accepted.");
}

main().catch(console.error);
