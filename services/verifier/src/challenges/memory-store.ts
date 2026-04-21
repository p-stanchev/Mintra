import type {
  ConsumePresentationChallengeResult,
  PresentationChallengeRecord,
  PresentationChallengeStore,
} from "./types";

export class MemoryPresentationChallengeStore implements PresentationChallengeStore {
  private readonly issued = new Map<string, PresentationChallengeRecord>();
  private readonly consumed = new Map<string, PresentationChallengeRecord>();

  async issue(record: PresentationChallengeRecord): Promise<void> {
    this.evictExpired();
    this.issued.set(record.challengeId, record);
  }

  async get(challengeId: string): Promise<PresentationChallengeRecord | null> {
    this.evictExpired();
    return this.issued.get(challengeId) ?? this.consumed.get(challengeId) ?? null;
  }

  async updatePasskeyAuthentication(
    challengeId: string,
    authentication: PresentationChallengeRecord["passkeyAuthentication"]
  ): Promise<PresentationChallengeRecord | null> {
    this.evictExpired();
    const current = this.issued.get(challengeId);
    if (!current || !authentication) return current ?? null;
    const updated: PresentationChallengeRecord = {
      ...current,
      passkeyAuthentication: authentication,
    };
    this.issued.set(challengeId, updated);
    return updated;
  }

  async consume(
    challengeId: string,
    consumedAt: string
  ): Promise<ConsumePresentationChallengeResult> {
    this.evictExpired();
    const active = this.issued.get(challengeId);
    if (!active) {
      const consumed = this.consumed.get(challengeId);
      if (consumed) {
        return {
          ok: false,
          reason: "already_consumed",
          record: consumed,
        };
      }
      return {
        ok: false,
        reason: "not_found",
      };
    }

    const consumedRecord: PresentationChallengeRecord = {
      ...active,
      status: "consumed",
      consumedAt,
    };

    this.issued.delete(challengeId);
    this.consumed.set(challengeId, consumedRecord);

    return {
      ok: true,
      record: consumedRecord,
    };
  }

  async close(): Promise<void> {
    this.issued.clear();
    this.consumed.clear();
  }

  private evictExpired() {
    const now = Date.now();
    for (const [challengeId, record] of this.issued) {
      if (new Date(record.expiresAt).getTime() <= now) {
        this.issued.delete(challengeId);
      }
    }

    for (const [challengeId, record] of this.consumed) {
      if (new Date(record.expiresAt).getTime() <= now) {
        this.consumed.delete(challengeId);
      }
    }
  }
}
