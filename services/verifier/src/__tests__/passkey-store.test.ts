import RedisMock from "ioredis-mock";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryPasskeyBindingStore } from "../passkeys/memory-store";
import { RedisPasskeyBindingStore } from "../passkeys/redis-store";
import type { PasskeyBindingStore, PendingPasskeyRegistration, StoredPasskeyBinding } from "../passkeys/types";

const storesToClose: PasskeyBindingStore[] = [];
const WALLET_ADDRESS = "B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ";

afterEach(async () => {
  while (storesToClose.length > 0) {
    const store = storesToClose.pop();
    if (store) {
      await store.close();
    }
  }
});

describe.each([
  {
    name: "memory",
    createStore: () => new MemoryPasskeyBindingStore(),
  },
  {
    name: "redis",
    createStore: () => new RedisPasskeyBindingStore(new RedisMock() as never),
  },
])("PasskeyBindingStore (%s)", ({ createStore }) => {
  async function setupStore() {
    const store = createStore();
    storesToClose.push(store);
    return store;
  }

  it("stores and reads a binding by id and wallet address", async () => {
    const store = await setupStore();
    const binding = createBinding();

    await store.upsertBinding(binding);

    await expect(store.getBindingById(binding.bindingId)).resolves.toEqual(binding);
    await expect(store.getBindingForWallet(binding.walletAddress)).resolves.toEqual(binding);
  });

  it("updates the binding counter", async () => {
    const store = await setupStore();
    const binding = createBinding();
    const updatedAt = new Date().toISOString();

    await store.upsertBinding(binding);
    await store.updateBindingCounter(binding.bindingId, 7, updatedAt);

    await expect(store.getBindingById(binding.bindingId)).resolves.toMatchObject({
      counter: 7,
      updatedAt,
    });
  });

  it("issues and consumes a pending registration exactly once", async () => {
    const store = await setupStore();
    const pending = createPendingRegistration();

    await store.issuePendingRegistration(pending);

    await expect(store.consumePendingRegistration(pending.registrationId)).resolves.toEqual(pending);
    await expect(store.consumePendingRegistration(pending.registrationId)).resolves.toBeNull();
  });

  it("rejects expired pending registrations", async () => {
    const store = await setupStore();
    const pending = createPendingRegistration({
      expiresAt: new Date(Date.now() - 5_000).toISOString(),
    });

    await store.issuePendingRegistration(pending);

    await expect(store.consumePendingRegistration(pending.registrationId)).resolves.toBeNull();
  });
});

function createBinding(overrides: Partial<StoredPasskeyBinding> = {}): StoredPasskeyBinding {
  const now = new Date().toISOString();
  return {
    bindingId: overrides.bindingId ?? crypto.randomUUID(),
    credentialId: overrides.credentialId ?? "credential-id-base64url",
    publicKey: overrides.publicKey ?? "public-key-base64url",
    counter: overrides.counter ?? 1,
    walletAddress: overrides.walletAddress ?? WALLET_ADDRESS,
    subjectId: overrides.subjectId ?? WALLET_ADDRESS,
    deviceName: overrides.deviceName ?? "Primary laptop",
    transports: overrides.transports ?? ["internal"],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    rpId: overrides.rpId ?? "example.com",
    origin: overrides.origin ?? "https://example.com",
  };
}

function createPendingRegistration(
  overrides: Partial<PendingPasskeyRegistration> = {}
): PendingPasskeyRegistration {
  const createdAt = overrides.createdAt ?? new Date().toISOString();
  return {
    registrationId: overrides.registrationId ?? crypto.randomUUID(),
    walletAddress: overrides.walletAddress ?? WALLET_ADDRESS,
    subjectId: overrides.subjectId ?? WALLET_ADDRESS,
    audience: overrides.audience ?? "https://example.com",
    origin: overrides.origin ?? "https://example.com",
    rpId: overrides.rpId ?? "example.com",
    challenge: overrides.challenge ?? "registration-challenge",
    createdAt,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    deviceName: overrides.deviceName ?? "Primary laptop",
  };
}
