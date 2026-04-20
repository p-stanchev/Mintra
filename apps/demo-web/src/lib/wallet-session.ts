export const LINKED_WALLET_STORAGE_KEY = "mintra.linkedWalletAddress";

// Mina public keys are base58-encoded, ~55 chars, always starting with B62
const MINA_PUBKEY_RE = /^B62[1-9A-HJ-NP-Za-km-z]{50,54}$/;

export function isValidMinaPublicKey(address: string): boolean {
  return MINA_PUBKEY_RE.test(address);
}

export function readLinkedWalletAddress(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LINKED_WALLET_STORAGE_KEY);
}

export function writeLinkedWalletAddress(address: string): void {
  if (typeof window === "undefined") return;
  if (!isValidMinaPublicKey(address)) {
    console.warn("[mintra] Rejected invalid Mina public key:", address.slice(0, 10) + "…");
    return;
  }
  window.localStorage.setItem(LINKED_WALLET_STORAGE_KEY, address);
  window.dispatchEvent(new CustomEvent("mintra:wallet-linked", { detail: address }));
}
