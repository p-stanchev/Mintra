"use client";

import { mintra } from "@/lib/mintra";
import {
  clearWalletSession,
  writeAuthToken,
  writeLinkedWalletAddress,
  writeLinkedWalletProviderId,
  writeLinkedWalletProviderName,
} from "./wallet-session";
import type { MinaWalletAdapter } from "./mina-wallet";

type ProviderError = {
  code?: number;
  message?: string;
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

function isProviderError(value: unknown): value is ProviderError {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("message" in value || "code" in value)
  );
}

export function extractErrorMessage(err: unknown): string {
  if (Array.isArray(err)) {
    const firstMessage = err.find(
      (entry): entry is { message: string } =>
        Boolean(entry && typeof entry === "object" && "message" in entry && typeof (entry as { message?: unknown }).message === "string")
    )?.message;
    if (firstMessage?.includes("Expected array, received object")) {
      return "This wallet rejected the request format. Reopen the wallet and try again.";
    }
    if (firstMessage) return firstMessage;
  }
  if (isProviderError(err)) {
    if (err.code === 4100) {
      return "Wrong password. Unlock the wallet and try again.";
    }
    if (err.message?.includes("Unauthorized: signPayload")) {
      return "Wrong password or locked wallet. Unlock Pallad and try again.";
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Wallet connection failed";
}

export async function authenticateWallet(
  provider: MinaWalletAdapter,
  walletAddress: string
): Promise<void> {
  const challenge = await mintra.createWalletAuthChallenge({ walletAddress });
  const signed = await provider.signMessage({ message: challenge.message }).catch((err: unknown) => err);

  if (isProviderError(signed) || signed instanceof Error) {
    throw new Error(extractErrorMessage(signed));
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
  writeLinkedWalletProviderId(provider.id);
  writeLinkedWalletProviderName(provider.name);
}

export async function resetWalletSession(): Promise<void> {
  try {
    await mintra.logout();
  } catch {
    // best-effort revoke; client storage is still cleared below
  }
  clearWalletSession();
}
