import { SignedZkProofMaterialBundleSchema, type SignedZkProofMaterialBundle } from "@mintra/sdk-types";

export interface EncryptedLocalCredentialEnvelope {
  version: "mintra.encrypted-local/v1";
  algorithm: "AES-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export async function encryptCredentialBackup(params: {
  bundle: SignedZkProofMaterialBundle;
  passphrase: string;
  iterations?: number;
}): Promise<EncryptedLocalCredentialEnvelope> {
  const iterations = params.iterations ?? 210_000;
  const bundle = SignedZkProofMaterialBundleSchema.parse(params.bundle);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(params.passphrase, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext)
  );

  return {
    version: "mintra.encrypted-local/v1",
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
  };
}

export async function decryptCredentialBackup(params: {
  envelope: EncryptedLocalCredentialEnvelope;
  passphrase: string;
}): Promise<SignedZkProofMaterialBundle> {
  const key = await deriveKey(
    params.passphrase,
    hexToBytes(params.envelope.salt),
    params.envelope.iterations
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(hexToBytes(params.envelope.iv)) },
    key,
    toArrayBuffer(hexToBytes(params.envelope.ciphertext))
  );
  return SignedZkProofMaterialBundleSchema.parse(
    JSON.parse(new TextDecoder().decode(new Uint8Array(plaintext)))
  );
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  if (value.length % 2 !== 0) {
    throw new Error("Invalid hex payload");
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
