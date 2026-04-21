import type {
  PasskeyBindingStore,
  PendingPasskeyRegistration,
  StoredPasskeyBinding,
} from "./types";

export class MemoryPasskeyBindingStore implements PasskeyBindingStore {
  private readonly bindingsById = new Map<string, StoredPasskeyBinding>();
  private readonly bindingIdsByWallet = new Map<string, string>();
  private readonly pendingRegistrations = new Map<string, PendingPasskeyRegistration>();

  async upsertBinding(binding: StoredPasskeyBinding): Promise<void> {
    this.bindingsById.set(binding.bindingId, binding);
    this.bindingIdsByWallet.set(binding.walletAddress, binding.bindingId);
  }

  async getBindingById(bindingId: string): Promise<StoredPasskeyBinding | null> {
    return this.bindingsById.get(bindingId) ?? null;
  }

  async getBindingForWallet(walletAddress: string): Promise<StoredPasskeyBinding | null> {
    const bindingId = this.bindingIdsByWallet.get(walletAddress);
    if (!bindingId) return null;
    return this.bindingsById.get(bindingId) ?? null;
  }

  async updateBindingCounter(bindingId: string, counter: number, updatedAt: string): Promise<void> {
    const current = this.bindingsById.get(bindingId);
    if (!current) return;
    this.bindingsById.set(bindingId, {
      ...current,
      counter,
      updatedAt,
    });
  }

  async issuePendingRegistration(challenge: PendingPasskeyRegistration): Promise<void> {
    this.evictExpiredPending();
    this.pendingRegistrations.set(challenge.registrationId, challenge);
  }

  async consumePendingRegistration(registrationId: string): Promise<PendingPasskeyRegistration | null> {
    this.evictExpiredPending();
    const pending = this.pendingRegistrations.get(registrationId) ?? null;
    if (pending) {
      this.pendingRegistrations.delete(registrationId);
    }
    return pending;
  }

  async close(): Promise<void> {
    this.bindingsById.clear();
    this.bindingIdsByWallet.clear();
    this.pendingRegistrations.clear();
  }

  private evictExpiredPending() {
    const now = Date.now();
    for (const [registrationId, pending] of this.pendingRegistrations) {
      if (new Date(pending.expiresAt).getTime() <= now) {
        this.pendingRegistrations.delete(registrationId);
      }
    }
  }
}
