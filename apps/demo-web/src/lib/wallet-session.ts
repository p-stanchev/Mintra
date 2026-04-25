import {
  GetZkProofInputResponseSchema,
  SignedZkProofMaterialBundleSchema,
  type GetZkProofInputResponse,
  type SignedZkProofMaterialBundle,
} from "@mintra/sdk-types";

export const LINKED_WALLET_STORAGE_KEY = "mintra.linkedWalletAddress";
export const AUTH_TOKEN_STORAGE_KEY = "mintra.authToken";
export const WALLET_PROVIDER_ID_STORAGE_KEY = "mintra.walletProviderId";
export const WALLET_PROVIDER_NAME_STORAGE_KEY = "mintra.walletProviderName";
const ZK_PROOF_MATERIAL_STORAGE_PREFIX = "mintra.zkProofMaterial.";

// Mina public keys are base58-encoded, ~55 chars, always starting with B62
const MINA_PUBKEY_RE = /^B62[1-9A-HJ-NP-Za-km-z]{50,54}$/;

export function isValidMinaPublicKey(address: string): boolean {
  return MINA_PUBKEY_RE.test(address);
}

export function readLinkedWalletAddress(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(LINKED_WALLET_STORAGE_KEY);
}

export function writeLinkedWalletAddress(address: string): void {
  if (typeof window === "undefined") return;
  if (!isValidMinaPublicKey(address)) {
    console.warn("[mintra] Rejected invalid Mina public key:", address.slice(0, 10) + "…");
    return;
  }
  window.sessionStorage.setItem(LINKED_WALLET_STORAGE_KEY, address);
  window.dispatchEvent(new CustomEvent("mintra:wallet-linked", { detail: address }));
}

export function readLinkedWalletProviderId(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(WALLET_PROVIDER_ID_STORAGE_KEY);
}

export function writeLinkedWalletProviderId(providerId: string | null): void {
  if (typeof window === "undefined") return;
  if (!providerId) {
    window.sessionStorage.removeItem(WALLET_PROVIDER_ID_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("mintra:wallet-provider", { detail: null }));
    return;
  }
  window.sessionStorage.setItem(WALLET_PROVIDER_ID_STORAGE_KEY, providerId);
  window.dispatchEvent(new CustomEvent("mintra:wallet-provider", { detail: providerId }));
}

export function readLinkedWalletProviderName(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(WALLET_PROVIDER_NAME_STORAGE_KEY);
}

export function writeLinkedWalletProviderName(providerName: string | null): void {
  if (typeof window === "undefined") return;
  if (!providerName) {
    window.sessionStorage.removeItem(WALLET_PROVIDER_NAME_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("mintra:wallet-provider-name", { detail: null }));
    return;
  }
  window.sessionStorage.setItem(WALLET_PROVIDER_NAME_STORAGE_KEY, providerName);
  window.dispatchEvent(new CustomEvent("mintra:wallet-provider-name", { detail: providerName }));
}

export function readAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function writeAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  window.dispatchEvent(new CustomEvent("mintra:auth-updated", { detail: token }));
}

export function readStoredZkProofMaterial(walletAddress: string): GetZkProofInputResponse | null {
  if (typeof window === "undefined" || !isValidMinaPublicKey(walletAddress)) return null;
  const raw = window.localStorage.getItem(`${ZK_PROOF_MATERIAL_STORAGE_PREFIX}${walletAddress}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const bundle = SignedZkProofMaterialBundleSchema.safeParse(parsed);
    if (bundle.success) {
      return bundle.data.proofMaterial;
    }
    return GetZkProofInputResponseSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function readStoredZkProofMaterialBundle(walletAddress: string): SignedZkProofMaterialBundle | null {
  if (typeof window === "undefined" || !isValidMinaPublicKey(walletAddress)) return null;
  const raw = window.localStorage.getItem(`${ZK_PROOF_MATERIAL_STORAGE_PREFIX}${walletAddress}`);
  if (!raw) return null;
  try {
    return SignedZkProofMaterialBundleSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStoredZkProofMaterialBundle(
  walletAddress: string,
  bundle: SignedZkProofMaterialBundle
): void {
  if (typeof window === "undefined" || !isValidMinaPublicKey(walletAddress)) return;
  window.localStorage.setItem(
    `${ZK_PROOF_MATERIAL_STORAGE_PREFIX}${walletAddress}`,
    JSON.stringify(SignedZkProofMaterialBundleSchema.parse(bundle))
  );
}

export function clearStoredZkProofMaterial(walletAddress: string | null): void {
  if (typeof window === "undefined" || !walletAddress || !isValidMinaPublicKey(walletAddress)) return;
  window.localStorage.removeItem(`${ZK_PROOF_MATERIAL_STORAGE_PREFIX}${walletAddress}`);
}

export function clearWalletSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(LINKED_WALLET_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.sessionStorage.removeItem(WALLET_PROVIDER_ID_STORAGE_KEY);
  window.sessionStorage.removeItem(WALLET_PROVIDER_NAME_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("mintra:auth-updated", { detail: null }));
  window.dispatchEvent(new CustomEvent("mintra:wallet-linked", { detail: null }));
  window.dispatchEvent(new CustomEvent("mintra:wallet-provider", { detail: null }));
  window.dispatchEvent(new CustomEvent("mintra:wallet-provider-name", { detail: null }));
}
