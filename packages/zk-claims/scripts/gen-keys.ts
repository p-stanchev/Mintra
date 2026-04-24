// One-time key generation for MintraAgeGate deployment.
// Run: node --import tsx/esm scripts/gen-keys.ts  (from packages/zk-claims)
// Store the output securely — never commit private keys.

import { PrivateKey } from "o1js";

const deployer = PrivateKey.random();
const zkApp = PrivateKey.random();

console.log(JSON.stringify({
  deployer: {
    privateKey: deployer.toBase58(),
    publicKey: deployer.toPublicKey().toBase58(),
  },
  zkApp: {
    privateKey: zkApp.toBase58(),
    publicKey: zkApp.toPublicKey().toBase58(),
  },
}, null, 2));
