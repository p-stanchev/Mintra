"use client";

import { mintra } from "@/lib/mintra";
import { clearWalletSession, writeAuthToken, writeLinkedWalletAddress } from "./wallet-session";

type ProviderError = Error & {
  code?: number;
  data?: unknown;
};

type SignedMessage = {
  publicKey: string;
  data: string;
  signature: {
    field: string;
    scalar: string;
  };
};

type MinaProvider = NonNullable<Window["mina"]>;

function isProviderError(value: unknown): value is ProviderError {
  return Boolean(
    value &&
      typeof value === "object" &&
      "message" in value &&
      typeof (value as { message?: unknown }).message === "string" &&
      "code" in value
  );
}

export async function authenticateWallet(provider: MinaProvider, walletAddress: string): Promise<void> {
  const challenge = await mintra.createWalletAuthChallenge({ walletAddress });
  const signed = await provider.signMessage({ message: challenge.message }).catch((err: unknown) => err);

  if (isProviderError(signed)) {
    throw new Error(signed.message);
  }

  if (!signed || typeof signed !== "object") {
    throw new Error("Wallet did not return a usable signature");
  }

  const signature = signed as SignedMessage;
  if (signature.publicKey !== walletAddress) {
    throw new Error("Signed wallet does not match the connected account");
  }

  const verified = await mintra.verifyWalletAuth({
    challengeId: challenge.challengeId,
    publicKey: signature.publicKey,
    data: signature.data,
    signature: signature.signature,
  });

  writeLinkedWalletAddress(verified.walletAddress);
  writeAuthToken(verified.token);
}

export async function resetWalletSession(): Promise<void> {
  try {
    await mintra.logout();
  } catch {
    // best-effort revoke; client storage is still cleared below
  }
  clearWalletSession();
}
