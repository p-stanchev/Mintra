"use client";

import { SignedZkProofMaterialBundleSchema, type SignedZkProofMaterialBundle } from "@mintra/sdk-types";
import { getWalletById } from "./mina-wallet";
import {
  readStoredZkProofMaterialBundle,
  writeStoredZkProofMaterialBundle,
} from "./wallet-session";

export type ReusableProofMaterialSource = "wallet" | "local" | "none";

export type ReusableProofMaterialResolution = {
  bundle: SignedZkProofMaterialBundle | null;
  source: ReusableProofMaterialSource;
};

export async function resolveReusableProofMaterial(params: {
  walletAddress: string;
  walletProviderId?: string | null;
}): Promise<ReusableProofMaterialResolution> {
  const walletBundle = await readWalletProofMaterialBundle(params);
  const localBundle = readStoredZkProofMaterialBundle(params.walletAddress);

  if (walletBundle && localBundle) {
    const walletIssuedAt = Date.parse(walletBundle.issuedAt);
    const localIssuedAt = Date.parse(localBundle.issuedAt);
    if (Number.isFinite(walletIssuedAt) && Number.isFinite(localIssuedAt)) {
      return localIssuedAt > walletIssuedAt
        ? { bundle: localBundle, source: "local" }
        : { bundle: walletBundle, source: "wallet" };
    }
    return { bundle: walletBundle, source: "wallet" };
  }

  if (walletBundle) {
    return { bundle: walletBundle, source: "wallet" };
  }

  if (localBundle) {
    return { bundle: localBundle, source: "local" };
  }

  return { bundle: null, source: "none" };
}

export async function persistReusableProofMaterial(params: {
  walletAddress: string;
  walletProviderId?: string | null;
  bundle: SignedZkProofMaterialBundle;
}): Promise<ReusableProofMaterialSource> {
  const storedInWallet = await writeWalletProofMaterialBundle(params);
  writeStoredZkProofMaterialBundle(params.walletAddress, params.bundle);
  return storedInWallet ? "wallet" : "local";
}

async function readWalletProofMaterialBundle(params: {
  walletAddress: string;
  walletProviderId?: string | null;
}): Promise<SignedZkProofMaterialBundle | null> {
  const provider = await getWalletById(params.walletProviderId);
  if (!provider?.capabilities.readProofMaterial) {
    return null;
  }

  try {
    const raw = await provider.getProofMaterialBundle({
      walletAddress: params.walletAddress,
    });
    return SignedZkProofMaterialBundleSchema.parse(raw);
  } catch {
    return null;
  }
}

async function writeWalletProofMaterialBundle(params: {
  walletAddress: string;
  walletProviderId?: string | null;
  bundle: SignedZkProofMaterialBundle;
}): Promise<boolean> {
  const provider = await getWalletById(params.walletProviderId);
  if (!provider?.capabilities.storeProofMaterial) {
    return false;
  }

  try {
    await provider.storeProofMaterialBundle({
      bundle: SignedZkProofMaterialBundleSchema.parse(params.bundle),
    });
    return true;
  } catch {
    return false;
  }
}
