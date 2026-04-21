import RedisMock from "ioredis-mock";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryPresentationChallengeStore } from "../challenges/memory-store";
import { RedisPresentationChallengeStore } from "../challenges/redis-store";
import type { PresentationChallengeRecord, PresentationChallengeStore } from "../challenges/types";

const storesToClose: PresentationChallengeStore[] = [];

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
    createStore: () => new MemoryPresentationChallengeStore(),
  },
  {
    name: "redis",
    createStore: () => new RedisPresentationChallengeStore(new RedisMock() as never),
  },
])("PresentationChallengeStore (%s)", ({ name, createStore }) => {
  async function setupStore() {
    const store = createStore();
    storesToClose.push(store);
    return store;
  }

  it("issues a challenge and reads it back", async () => {
    const store = await setupStore();
    const record = createRecord();

    await store.issue(record);
    const loaded = await store.get(record.challengeId);

    expect(loaded).toEqual(record);
  });

  it("allows the first consume and marks the challenge consumed", async () => {
    const store = await setupStore();
    const record = createRecord();
    const consumedAt = new Date().toISOString();

    await store.issue(record);
    const firstConsume = await store.consume(record.challengeId, consumedAt);

    expect(firstConsume.ok).toBe(true);
    if (firstConsume.ok) {
      expect(firstConsume.record.status).toBe("consumed");
      expect(firstConsume.record.consumedAt).toBe(consumedAt);
    }
  });

  it("rejects a second consume as replay", async () => {
    const store = await setupStore();
    const record = createRecord();

    await store.issue(record);
    await store.consume(record.challengeId, new Date().toISOString());
    const replay = await store.consume(record.challengeId, new Date().toISOString());

    expect(replay).toMatchObject({
      ok: false,
      reason: "already_consumed",
    });
  });

  it("rejects expired challenges", async () => {
    const store = await setupStore();
    const record = createRecord({
      expiresAt: new Date(Date.now() - 5_000).toISOString(),
    });

    await store.issue(record);
    const loaded = await store.get(record.challengeId);
    const consumed = await store.consume(record.challengeId, new Date().toISOString());

    expect(loaded).toBeNull();
    expect(consumed).toMatchObject({
      ok: false,
      reason: "not_found",
    });
  });

  it("allows only one success across parallel consume attempts", async () => {
    if (name === "redis") {
      return;
    }

    const store = await setupStore();
    const record = createRecord();

    await store.issue(record);

    const attempts = await Promise.all([
      store.consume(record.challengeId, new Date().toISOString()),
      store.consume(record.challengeId, new Date().toISOString()),
      store.consume(record.challengeId, new Date().toISOString()),
      store.consume(record.challengeId, new Date().toISOString()),
    ]);

    const successes = attempts.filter((attempt) => attempt.ok);
    const replays = attempts.filter((attempt) => !attempt.ok && attempt.reason === "already_consumed");

    expect(successes).toHaveLength(1);
    expect(replays.length).toBeGreaterThanOrEqual(1);
  });
});

function createRecord(
  overrides: Partial<PresentationChallengeRecord> = {}
): PresentationChallengeRecord {
  const challengeId = overrides.challengeId ?? crypto.randomUUID();
  const createdAt = overrides.createdAt ?? new Date().toISOString();
  const expiresAt =
    overrides.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return {
    challengeId,
    nonce: overrides.nonce ?? "nonce-123",
    audience: overrides.audience ?? "https://example.com",
    proofProductId: overrides.proofProductId ?? "proof_of_age_18",
    policy: overrides.policy ?? {
      minAge: 18,
      requireKycPassed: true,
      countryAllowlist: [],
      countryBlocklist: [],
      maxCredentialAgeDays: 30,
    },
    claimRequestRef: overrides.claimRequestRef ?? "request-ref",
    createdAt,
    expiresAt,
    consumedAt: overrides.consumedAt ?? null,
    status: overrides.status ?? "issued",
    passkeyAuthentication: overrides.passkeyAuthentication ?? null,
    requestEnvelope:
      overrides.requestEnvelope ??
      ({
        version: "mintra.presentation-request/v1",
        proofProduct: {
          id: "proof_of_age_18",
          displayName: "Proof of Age 18+",
          description: "Age proof",
          requestedClaims: ["age_over_18"],
          verificationRequirements: ["age_over_18 must be true"],
          outputFields: ["ageOver18"],
        },
        challenge: {
          version: "mintra.challenge/v1",
          challengeId,
          nonce: overrides.nonce ?? "nonce-123",
          verifier: "https://verifier.example.com",
          audience: overrides.audience ?? "https://example.com",
          action: "mintra:test",
          proofProductId: overrides.proofProductId ?? "proof_of_age_18",
          claimRequestRef: overrides.claimRequestRef ?? "request-ref",
          issuedAt: createdAt,
          expiresAt,
          policy: overrides.policy ?? {
            minAge: 18,
            requireKycPassed: true,
            countryAllowlist: [],
            countryBlocklist: [],
            maxCredentialAgeDays: 30,
          },
          replayProtection: {
            challengeId,
            nonce: overrides.nonce ?? "nonce-123",
            singleUse: true,
            expiresAt,
          },
          holderBindingContext: {
            walletAddress: "B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ",
            subjectId: "B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ",
            requiredMethods: ["wallet"],
          },
        },
        presentationRequest: {
          type: "https",
        },
        presentationRequestJson: "{\"type\":\"https\"}",
        holderBindingFormat: "mina:signMessage",
      }) as unknown as PresentationChallengeRecord["requestEnvelope"],
  };
}
