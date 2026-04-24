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
