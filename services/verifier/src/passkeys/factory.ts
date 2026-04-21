import Redis from "ioredis";
import { MemoryPasskeyBindingStore } from "./memory-store";
import { RedisPasskeyBindingStore } from "./redis-store";
import type { PasskeyBindingStore } from "./types";

export interface PasskeyStoreFactoryResult {
  store: PasskeyBindingStore;
  driver: "memory" | "redis";
}

export function createPasskeyBindingStoreFromEnv(): PasskeyStoreFactoryResult {
  const redisUrl = process.env["REDIS_URL"]?.trim();

  if (!redisUrl) {
    return {
      store: new MemoryPasskeyBindingStore(),
      driver: "memory",
    };
  }

  const redis = new Redis(redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
  });

  return {
    store: new RedisPasskeyBindingStore(redis),
    driver: "redis",
  };
}
