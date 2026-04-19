export const LINKED_WALLET_STORAGE_KEY = "mintra.linkedWalletAddress";

export function readLinkedWalletAddress(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LINKED_WALLET_STORAGE_KEY);
}

export function writeLinkedWalletAddress(address: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LINKED_WALLET_STORAGE_KEY, address);
  window.dispatchEvent(new CustomEvent("mintra:wallet-linked", { detail: address }));
}
