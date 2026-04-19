import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { DiditProvider } from "../provider";

const TEST_SECRET = "test-webhook-secret-abc123";
const TEST_API_KEY = "test-api-key";

function makeProvider() {
  return new DiditProvider({ apiKey: TEST_API_KEY, webhookSecret: TEST_SECRET });
}

function signBody(body: string): string {
  return createHmac("sha256", TEST_SECRET).update(Buffer.from(body)).digest("hex");
}

const APPROVED_PAYLOAD = JSON.stringify({
  session_id: "sess-abc-123",
  status: "Approved",
  webhook_type: "status.updated",
  vendor_data: "user-001",
  decision: {
    id_verification: {
      status: "APPROVED",
      document_type: "PASSPORT",
      country: "AT",
    },
    face_match: { status: "APPROVED" },
    liveness: { status: "APPROVED" },
  },
});

const DECLINED_PAYLOAD = JSON.stringify({
  session_id: "sess-xyz-999",
  status: "Declined",
  webhook_type: "status.updated",
  vendor_data: "user-002",
  decision: {
    id_verification: { status: "DECLINED" },
  },
});

describe("DiditProvider.parseWebhook", () => {
  it("accepts a valid HMAC signature and parses the payload", async () => {
    const provider = makeProvider();
    const rawBody = Buffer.from(APPROVED_PAYLOAD);
    const sig = signBody(APPROVED_PAYLOAD);

    const event = await provider.parseWebhook({ rawBody, signature: sig });

    expect(event.sessionId).toBe("sess-abc-123");
    expect(event.userId).toBe("user-001");
    expect(event.rawStatus).toBe("Approved");
    expect(event.decision.id_verification.status).toBe("APPROVED");
    expect(event.decision.id_verification.country).toBe("AT");
  });

  it("rejects an incorrect HMAC signature", async () => {
    const provider = makeProvider();
    const rawBody = Buffer.from(APPROVED_PAYLOAD);

    await expect(
      provider.parseWebhook({ rawBody, signature: "deadbeef00000000" })
    ).rejects.toThrow(/signature/i);
  });

  it("rejects a tampered body", async () => {
    const provider = makeProvider();
    const original = Buffer.from(APPROVED_PAYLOAD);
    const sig = signBody(APPROVED_PAYLOAD);
    const tampered = Buffer.from(APPROVED_PAYLOAD.replace("Approved", "Declined"));

    await expect(
      provider.parseWebhook({ rawBody: tampered, signature: sig })
    ).rejects.toThrow(/signature/i);
  });
});

describe("DiditProvider.mapClaims", () => {
  it("maps an approved event to all positive claims", async () => {
    const provider = makeProvider();
    const rawBody = Buffer.from(APPROVED_PAYLOAD);
    const sig = signBody(APPROVED_PAYLOAD);
    const event = await provider.parseWebhook({ rawBody, signature: sig });

    const claims = provider.mapClaims(event);

    expect(claims.kyc_passed).toBe(true);
    expect(claims.age_over_18).toBe(true);
    expect(claims.country_code).toBe("AT");
  });

  it("maps a declined event with no positive claims", async () => {
    const provider = makeProvider();
    const rawBody = Buffer.from(DECLINED_PAYLOAD);
    const sig = signBody(DECLINED_PAYLOAD);
    const event = await provider.parseWebhook({ rawBody, signature: sig });

    const claims = provider.mapClaims(event);

    expect(claims.kyc_passed).toBeUndefined();
    expect(claims.age_over_18).toBeUndefined();
    expect(claims.country_code).toBeUndefined();
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
});
