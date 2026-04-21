import type Redis from "ioredis";
import type {
  PasskeyBindingStore,
  PendingPasskeyRegistration,
  StoredPasskeyBinding,
} from "./types";

const BINDING_PREFIX = "mintra:verifier:passkey:binding:";
const WALLET_PREFIX = "mintra:verifier:passkey:wallet:";
const PENDING_PREFIX = "mintra:verifier:passkey:pending:";

export class RedisPasskeyBindingStore implements PasskeyBindingStore {
  constructor(private readonly redis: Redis) {}

  async upsertBinding(binding: StoredPasskeyBinding): Promise<void> {
    const tx = this.redis.multi();
    tx.set(bindingKey(binding.bindingId), JSON.stringify(binding));
    tx.set(walletKey(binding.walletAddress), binding.bindingId);
    await tx.exec();
  }

  async getBindingById(bindingId: string): Promise<StoredPasskeyBinding | null> {
    const raw = await this.redis.get(bindingKey(bindingId));
    return raw ? (JSON.parse(raw) as StoredPasskeyBinding) : null;
  }

  async getBindingForWallet(walletAddress: string): Promise<StoredPasskeyBinding | null> {
    const bindingId = await this.redis.get(walletKey(walletAddress));
    if (!bindingId) return null;
    return this.getBindingById(bindingId);
  }

  async updateBindingCounter(bindingId: string, counter: number, updatedAt: string): Promise<void> {
    const current = await this.getBindingById(bindingId);
    if (!current) return;
    await this.redis.set(
      bindingKey(bindingId),
      JSON.stringify({
        ...current,
        counter,
        updatedAt,
      })
    );
  }

  async issuePendingRegistration(challenge: PendingPasskeyRegistration): Promise<void> {
    const ttlSeconds = secondsUntil(challenge.expiresAt);
    if (ttlSeconds === null) return;
    await this.redis.set(
      pendingKey(challenge.registrationId),
      JSON.stringify(challenge),
      "EX",
      ttlSeconds
    );
  }

  async consumePendingRegistration(registrationId: string): Promise<PendingPasskeyRegistration | null> {
    const key = pendingKey(registrationId);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    return JSON.parse(raw) as PendingPasskeyRegistration;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

function bindingKey(bindingId: string) {
  return `${BINDING_PREFIX}${bindingId}`;
}

function walletKey(walletAddress: string) {
  return `${WALLET_PREFIX}${walletAddress}`;
}

function pendingKey(registrationId: string) {
  return `${PENDING_PREFIX}${registrationId}`;
}

function secondsUntil(isoTimestamp: string): number | null {
  const milliseconds = new Date(isoTimestamp).getTime() - Date.now();
  if (milliseconds <= 0) return null;
  return Math.max(1, Math.ceil(milliseconds / 1000));
}
