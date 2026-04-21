import Redis from "ioredis";
import { MemoryPresentationChallengeStore } from "./memory-store";
import { RedisPresentationChallengeStore } from "./redis-store";
import type { PresentationChallengeStore } from "./types";

export interface ChallengeStoreFactoryResult {
  store: PresentationChallengeStore;
  driver: "memory" | "redis";
}

export function createPresentationChallengeStoreFromEnv(): ChallengeStoreFactoryResult {
  const redisUrl = process.env["REDIS_URL"]?.trim();

  if (!redisUrl) {
    return {
      store: new MemoryPresentationChallengeStore(),
      driver: "memory",
    };
  }

  const redis = new Redis(redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
  });

  return {
    store: new RedisPresentationChallengeStore(redis),
    driver: "redis",
  };
}
