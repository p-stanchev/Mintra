import type Redis from "ioredis";
import type {
  ConsumePresentationChallengeResult,
  PresentationChallengeRecord,
  PresentationChallengeStore,
} from "./types";

const ACTIVE_PREFIX = "mintra:verifier:challenge:active:";
const CONSUMED_PREFIX = "mintra:verifier:challenge:consumed:";
const WATCH_RETRY_LIMIT = 5;

export class RedisPresentationChallengeStore implements PresentationChallengeStore {
  constructor(private readonly redis: Redis) {}

  async issue(record: PresentationChallengeRecord): Promise<void> {
    const ttlSeconds = ttlSecondsUntil(record.expiresAt);
    if (ttlSeconds === null) {
      return;
    }

    await this.redis.set(
      activeKey(record.challengeId),
      JSON.stringify(record),
      "EX",
      ttlSeconds
    );
  }

  async get(challengeId: string): Promise<PresentationChallengeRecord | null> {
    const active = await this.redis.get(activeKey(challengeId));
    if (active) {
      return JSON.parse(active) as PresentationChallengeRecord;
    }

    const consumed = await this.redis.get(consumedKey(challengeId));
    if (consumed) {
      return JSON.parse(consumed) as PresentationChallengeRecord;
    }

    return null;
  }

  async updatePasskeyAuthentication(
    challengeId: string,
    authentication: PresentationChallengeRecord["passkeyAuthentication"]
  ): Promise<PresentationChallengeRecord | null> {
    if (!authentication) return this.get(challengeId);
    const current = await this.get(challengeId);
    if (!current || current.status !== "issued") return current;
    const updated: PresentationChallengeRecord = {
      ...current,
      passkeyAuthentication: authentication,
    };
    const ttlSeconds = ttlSecondsUntil(updated.expiresAt);
    if (ttlSeconds === null) return null;
    await this.redis.set(activeKey(challengeId), JSON.stringify(updated), "EX", ttlSeconds);
    return updated;
  }

  async consume(
    challengeId: string,
    consumedAt: string
  ): Promise<ConsumePresentationChallengeResult> {
    for (let attempt = 0; attempt < WATCH_RETRY_LIMIT; attempt += 1) {
      await this.redis.watch(activeKey(challengeId));
      const [active, consumed] = await this.redis.mget(
        activeKey(challengeId),
        consumedKey(challengeId)
      );

      if (!active) {
        await this.redis.unwatch();
        if (consumed) {
          return {
            ok: false,
            reason: "already_consumed",
            record: JSON.parse(consumed) as PresentationChallengeRecord,
          };
        }

        return {
          ok: false,
          reason: "not_found",
        };
      }

      const activeRecord = JSON.parse(active) as PresentationChallengeRecord;
      const consumedRecord: PresentationChallengeRecord = {
        ...activeRecord,
        status: "consumed",
        consumedAt,
      };

      // We keep a consumed tombstone until at least the original challenge expiry.
      // That preserves replay detection across verifier instances without retaining
      // challenge metadata indefinitely.
      const replayTtlSeconds = replayTtlSecondsUntil(activeRecord.expiresAt);
      const tx = this.redis.multi();
      tx.del(activeKey(challengeId));
      tx.set(
        consumedKey(challengeId),
        JSON.stringify(consumedRecord),
        "EX",
        replayTtlSeconds
      );

      const result = await tx.exec();
      if (result) {
        return {
          ok: true,
          record: consumedRecord,
        };
      }
    }

    const fallbackConsumed = await this.redis.get(consumedKey(challengeId));
    if (fallbackConsumed) {
      return {
        ok: false,
        reason: "already_consumed",
        record: JSON.parse(fallbackConsumed) as PresentationChallengeRecord,
      };
    }

    return {
      ok: false,
      reason: "not_found",
    };
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

function activeKey(challengeId: string) {
  return `${ACTIVE_PREFIX}${challengeId}`;
}

function consumedKey(challengeId: string) {
  return `${CONSUMED_PREFIX}${challengeId}`;
}

function ttlSecondsUntil(isoTimestamp: string): number | null {
  const milliseconds = new Date(isoTimestamp).getTime() - Date.now();
  if (milliseconds <= 0) return null;
  return Math.max(1, Math.ceil(milliseconds / 1000));
}

function replayTtlSecondsUntil(isoTimestamp: string): number {
  const ttlSeconds = ttlSecondsUntil(isoTimestamp);
  if (ttlSeconds === null) return 60;
  return Math.max(60, ttlSeconds);
}
