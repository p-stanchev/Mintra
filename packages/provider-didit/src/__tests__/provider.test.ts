import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { DiditProvider } from "../provider";

const TEST_SECRET = "test-webhook-secret-abc123";
const TEST_API_KEY = "test-api-key";

function makeProvider() {
  return new DiditProvider({ apiKey: TEST_API_KEY, webhookSecret: TEST_SECRET, workflowId: "wf-test" });
}

function nowTs(): string {
  return String(Math.floor(Date.now() / 1000));
}

function signV2(body: unknown): string {
  const sorted = JSON.stringify(sortKeys(body));
  return createHmac("sha256", TEST_SECRET).update(sorted, "utf8").digest("hex");
}

function sortKeys(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(sortKeys);
  if (data !== null && typeof data === "object") {
    return Object.keys(data as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((r, k) => {
        r[k] = sortKeys((data as Record<string, unknown>)[k]);
        return r;
      }, {});
  }
  return data;
}

function makeApprovedPayload(ts: string) {
  return {
    session_id: "sess-abc-123",
    status: "Approved",
    webhook_type: "status.updated",
    vendor_data: "user-001",
    timestamp: Number(ts),
    decision: {
      id_verification: { status: "APPROVED", age: 34, document_type: "PASSPORT", country: "AT", date_of_birth: "1990-06-15" },
      face_match: { status: "APPROVED" },
      liveness: { status: "APPROVED" },
    },
  };
}

function makeDeclinedPayload(ts: string) {
  return {
    session_id: "sess-xyz-999",
    status: "Declined",
    webhook_type: "status.updated",
    vendor_data: "user-002",
    timestamp: Number(ts),
    decision: { id_verification: { status: "DECLINED" } },
  };
}

describe("DiditProvider.parseWebhook", () => {
  it("accepts a valid HMAC v2 signature and parses the payload", async () => {
    const provider = makeProvider();
    const ts = nowTs();
    const payload = makeApprovedPayload(ts);
    const rawBody = Buffer.from(JSON.stringify(payload));
    const sig = signV2(payload);

    const event = await provider.parseWebhook({ rawBody, parsedBody: payload, signatureV2: sig, timestamp: ts });

    expect(event.sessionId).toBe("sess-abc-123");
    expect(event.userId).toBe("user-001");
    expect(event.rawStatus).toBe("Approved");
    expect(event.decision.id_verification.status).toBe("APPROVED");
    expect(event.decision.id_verification.country).toBe("AT");
  });

  it("rejects an incorrect HMAC signature", async () => {
    const provider = makeProvider();
    const ts = nowTs();
    const payload = makeApprovedPayload(ts);
    const rawBody = Buffer.from(JSON.stringify(payload));

    await expect(
      provider.parseWebhook({ rawBody, parsedBody: payload, signatureV2: "a".repeat(64), timestamp: ts })
    ).rejects.toThrow(/signature/i);
  });

  it("rejects a tampered body", async () => {
    const provider = makeProvider();
    const ts = nowTs();
    const payload = makeApprovedPayload(ts);
    const rawBody = Buffer.from(JSON.stringify(payload));
    const sig = signV2(payload);
    const tamperedPayload = { ...payload, status: "Declined" };

    await expect(
      provider.parseWebhook({ rawBody, parsedBody: tamperedPayload, signatureV2: sig, timestamp: ts })
    ).rejects.toThrow(/signature/i);
  });

  it("rejects a stale timestamp", async () => {
    const provider = makeProvider();
    const staleTs = String(Math.floor(Date.now() / 1000) - 120);
    const payload = makeApprovedPayload(staleTs);
    const rawBody = Buffer.from(JSON.stringify(payload));
    const sig = signV2(payload);

    await expect(
      provider.parseWebhook({ rawBody, parsedBody: payload, signatureV2: sig, timestamp: staleTs })
    ).rejects.toThrow(/stale/i);
  });
});

describe("DiditProvider.mapClaims", () => {
  it("maps an approved event to all positive claims", async () => {
    const provider = makeProvider();
    const ts = nowTs();
    const payload = makeApprovedPayload(ts);
    const rawBody = Buffer.from(JSON.stringify(payload));
    const sig = signV2(payload);
    const event = await provider.parseWebhook({ rawBody, parsedBody: payload, signatureV2: sig, timestamp: ts });

    const claims = provider.mapClaims(event);

    expect(claims.kyc_passed).toBe(true);
    expect(claims.age_over_18).toBe(true);
    expect(claims.country_code).toBe("AT");
  });

  it("maps a declined event with no positive claims", async () => {
    const provider = makeProvider();
    const ts = nowTs();
    const payload = makeDeclinedPayload(ts);
    const rawBody = Buffer.from(JSON.stringify(payload));
    const sig = signV2(payload);
    const event = await provider.parseWebhook({ rawBody, parsedBody: payload, signatureV2: sig, timestamp: ts });

    const claims = provider.mapClaims(event);

    expect(claims.kyc_passed).toBeUndefined();
    expect(claims.age_over_18).toBeUndefined();
    expect(claims.country_code).toBeUndefined();
  });

  it("does not grant age_over_18 to an underage user even if ID is approved", async () => {
    const provider = makeProvider();
    const ts = nowTs();
    const payload = {
      ...makeApprovedPayload(ts),
      decision: {
        id_verification: {
          status: "APPROVED",
          age: 17,
          document_type: "IDENTITY_CARD",
          country: "BGR",
          date_of_birth: "2008-10-30", // 17 years old as of 2026
        },
        face_match: { status: "APPROVED" },
        liveness: { status: "APPROVED" },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const sig = signV2(payload);
    const event = await provider.parseWebhook({ rawBody, parsedBody: payload, signatureV2: sig, timestamp: ts });
    const claims = provider.mapClaims(event);

    expect(claims.kyc_passed).toBe(true);
    expect(claims.age_over_18).toBeUndefined();
  });

  it("does not grant age_over_18 when explicit age is absent from webhook", async () => {
    const provider = makeProvider();
    const ts = nowTs();
    const payload = {
      ...makeApprovedPayload(ts),
      decision: {
        id_verification: { status: "APPROVED", country: "AT" }, // no age
        face_match: { status: "APPROVED" },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const sig = signV2(payload);
    const event = await provider.parseWebhook({ rawBody, parsedBody: payload, signatureV2: sig, timestamp: ts });
    const claims = provider.mapClaims(event);

    expect(claims.kyc_passed).toBe(true);
    expect(claims.age_over_18).toBeUndefined();
  });

  it("grants age_over_18 when Didit sends age as a string", async () => {
    const provider = makeProvider();
    const ts = nowTs();
    const payload = {
      ...makeApprovedPayload(ts),
      decision: {
        id_verification: { status: "APPROVED", age: "21", country: "AT" },
        face_match: { status: "APPROVED" },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const sig = signV2(payload);
    const event = await provider.parseWebhook({ rawBody, parsedBody: payload, signatureV2: sig, timestamp: ts });
    const claims = provider.mapClaims(event);

    expect(claims.kyc_passed).toBe(true);
    expect(claims.age_over_18).toBe(true);
  });

  it("produces no claims for In Review status", () => {
    const provider = makeProvider();
    const claims = provider.mapClaims({
      sessionId: "s",
      userId: "u",
      rawStatus: "In Review",
      decision: { id_verification: { status: "PENDING" } },
    });

    expect(claims.kyc_passed).toBeUndefined();
    expect(claims.age_over_18).toBeUndefined();
  });

  it("materializes deterministic commitments and derived claims", async () => {
    const provider = makeProvider();
    const ts = nowTs();
    const payload = makeApprovedPayload(ts);
    const rawBody = Buffer.from(JSON.stringify(payload));
    const sig = signV2(payload);
    const event = await provider.parseWebhook({ rawBody, parsedBody: payload, signatureV2: sig, timestamp: ts });

    const first = await provider.materializeClaims(event);
    const second = await provider.materializeClaims(event);

    expect(first.claimModelVersion).toBe("v2");
    expect(first.normalizedClaims.age_over_18).toBe(true);
    expect(first.derivedClaims["age_over_18"]?.value).toBe(true);
    expect(first.derivedClaims["country_code"]?.value).toBe("AT");
    expect(first.sourceCommitments["dob_commitment"]?.value).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sourceCommitments["country_code_commitment"]?.value).toMatch(/^[a-f0-9]{64}$/);
    expect(first.sourceCommitments["dob_commitment"]?.value).toBe(second.sourceCommitments["dob_commitment"]?.value);
    expect(first.sourceCommitments["country_code_commitment"]?.value).toBe(
      second.sourceCommitments["country_code_commitment"]?.value
    );
  });
});
