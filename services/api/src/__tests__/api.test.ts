import { createHmac } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app";
import type { FastifyInstance } from "fastify";

const TEST_SECRET = "integration-test-secret-xyz";
const TEST_API_KEY = "integration-test-api-key";
const TEST_WORKFLOW_ID = "test-workflow-id";
const WALLET_1 = "B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ";
const WALLET_2 = "B62qj6z7oseWTr37SQTn53mF8ebHn45cmSfRC58Sy52wG6KcaPZNWjw";
const WALLET_3 = "B62qr2zNMypNKXmzMYSVotChTBRfXzHRtshvbuEjAQZLq6aEa8RxLyD";

function sign(body: string): string {
  return createHmac("sha256", TEST_SECRET).update(Buffer.from(body)).digest("hex");
}

function authHeader(app: FastifyInstance, walletAddress: string): Record<string, string> {
  const session = app.authStore.createSession(walletAddress);
  return { authorization: `Bearer ${session.token}` };
}

function signV2(payload: unknown): string {
  return createHmac("sha256", TEST_SECRET)
    .update(JSON.stringify(sortKeys(shortenFloats(payload))), "utf8")
    .digest("hex");
}

describe("Mintra API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({
      corsOrigin: "*",
      diditApiKey: TEST_API_KEY,
      diditWebhookSecret: TEST_SECRET,
      diditWorkflowId: TEST_WORKFLOW_ID,
      logger: false,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true });
  });

  it("POST /api/providers/didit/webhook with bad signature returns 401", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      session_id: "sess-999",
      status: "Approved",
      webhook_type: "status.updated",
      vendor_data: WALLET_1,
      timestamp,
      decision: { id_verification: { status: "APPROVED" } },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/providers/didit/webhook",
      headers: {
        "content-type": "application/json",
        "x-signature-simple": "badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb",
        "x-timestamp": String(timestamp),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/claims/:userId requires wallet auth", async () => {
    const res = await app.inject({ method: "GET", url: `/api/claims/${WALLET_1}` });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/claims/:userId returns empty claims for the authenticated wallet", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/claims/${WALLET_1}`,
      headers: authHeader(app, WALLET_1),
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.userId).toBe(WALLET_1);
    expect(data.claims).toEqual({});
    expect(data.verifiedAt).toBeNull();
  });

  it("GET /api/verifications/:id/status returns 404 for unknown id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/verifications/00000000-0000-0000-0000-000000000000/status",
      headers: authHeader(app, WALLET_1),
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/verifications/start requires wallet auth", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/verifications/start",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ userId: WALLET_1 }),
    });

    expect(res.statusCode).toBe(401);
  });

  it("GET /api/verifications/:id/status resolves by internal UUID only", async () => {
    const verification = await app.store.createVerification(WALLET_1, "provider-session-123");

    // Internal UUID works
    const res = await app.inject({
      method: "GET",
      url: `/api/verifications/${verification.id}/status`,
      headers: authHeader(app, WALLET_1),
    });
    expect(res.statusCode).toBe(200);

    // Provider session ID must NOT be a valid lookup key (security: prevents enumeration)
    const res2 = await app.inject({
      method: "GET",
      url: "/api/verifications/provider-session-123/status",
      headers: authHeader(app, WALLET_1),
    });
    expect(res2.statusCode).toBe(404);
  });

  it("webhook with valid v2 signature updates store and stores claims", async () => {
    const sessionId = "sess-valid-123";
    const timestamp = Math.floor(Date.now() / 1000);
    await app.store.createVerification(WALLET_1, sessionId);

    const payload = {
      session_id: sessionId,
      status: "Approved",
      webhook_type: "status.updated",
      vendor_data: WALLET_1,
      timestamp,
      decision: { id_verification: { status: "APPROVED", country: "US" } },
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/providers/didit/webhook",
      headers: {
        "content-type": "application/json",
        "x-signature-v2": signV2(payload),
        "x-timestamp": String(timestamp),
      },
      payload: JSON.stringify(payload),
    });
    expect(res.statusCode).toBe(200);

    const claims = await app.store.getClaims(WALLET_1);
    expect(claims?.kycPassed).toBe(true);
    expect(claims?.ageOver18).toBe(true);
  });

  it("webhook maps Didit v3 approved payloads with date_of_birth and issuing_state", async () => {
    const sessionId = "sess-v3-123";
    const timestamp = Math.floor(Date.now() / 1000);
    await app.store.createVerification(WALLET_2, sessionId);

    const payload = {
      session_id: sessionId,
      status: "Approved",
      webhook_type: "status.updated",
      vendor_data: WALLET_2,
      timestamp,
      decision: {
        status: "Approved",
        id_verification: {
          status: "Approved",
          document_type: "Identity Card",
          date_of_birth: "1980-01-01",
          issuing_state: "ESP",
        },
        liveness: {
          status: "Approved",
        },
        face_match: {
          status: "Approved",
        },
      },
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/providers/didit/webhook",
      headers: {
        "content-type": "application/json",
        "x-signature-v2": signV2(payload),
        "x-timestamp": String(timestamp),
      },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(200);

    const claims = await app.store.getClaims(WALLET_2);
    expect(claims?.kycPassed).toBe(true);
    expect(claims?.ageOver18).toBe(true);
    expect(claims?.countryCode).toBe("ES");
  });

  it("webhook maps full country names to ISO alpha-2 claims", async () => {
    const sessionId = "sess-country-name-123";
    const timestamp = Math.floor(Date.now() / 1000);
    await app.store.createVerification(WALLET_3, sessionId);

    const payload = {
      session_id: sessionId,
      status: "Approved",
      webhook_type: "status.updated",
      vendor_data: WALLET_3,
      timestamp,
      decision: {
        id_verification: {
          status: "Approved",
          country: "Spain",
          date_of_birth: "1985-04-01",
        },
      },
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/providers/didit/webhook",
      headers: {
        "content-type": "application/json",
        "x-signature-v2": signV2(payload),
        "x-timestamp": String(timestamp),
      },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(200);

    const claims = await app.store.getClaims(WALLET_3);
    expect(claims?.countryCode).toBe("ES");
    expect(claims?.ageOver18).toBe(true);
  });

  it("webhook with valid v2 signature is accepted", async () => {
    const sessionId = "sess-v2-123";
    const timestamp = Math.floor(Date.now() / 1000);
    await app.store.createVerification(WALLET_1, sessionId);

    const payload = {
      session_id: sessionId,
      status: "Approved",
      webhook_type: "status.updated",
      vendor_data: WALLET_1,
      timestamp,
      decision: { id_verification: { status: "APPROVED", country: "DE" } },
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/providers/didit/webhook",
      headers: {
        "content-type": "application/json",
        "x-signature-v2": signV2(payload),
        "x-timestamp": String(timestamp),
      },
      payload: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(200);

    const claims = await app.store.getClaims(WALLET_1);
    expect(claims?.kycPassed).toBe(true);
    expect(claims?.countryCode).toBe("DE");
  });

  it("webhook with unmapped interim status stays pending instead of error", async () => {
    const sessionId = "sess-pending-123";
    const timestamp = Math.floor(Date.now() / 1000);
    const verification = await app.store.createVerification(WALLET_1, sessionId);

    const payload = {
      session_id: sessionId,
      status: "Not Started",
      webhook_type: "status.updated",
      vendor_data: WALLET_1,
      timestamp,
      decision: { id_verification: { status: "PENDING" } },
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/providers/didit/webhook",
      headers: {
        "content-type": "application/json",
        "x-signature-v2": signV2(payload),
        "x-timestamp": String(timestamp),
      },
      payload: JSON.stringify(payload),
    });
    expect(res.statusCode).toBe(200);

    const updated = await app.store.getVerification(verification.id);
    expect(updated?.status).toBe("pending");
  });

  it("GET /api/claims/:userId rejects reading another wallet's claims", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/claims/${WALLET_1}`,
      headers: authHeader(app, WALLET_2),
    });

    expect(res.statusCode).toBe(403);
  });

  it("GET /api/verifications/:id/status rejects another wallet", async () => {
    const verification = await app.store.createVerification(WALLET_1, "provider-session-locked");
    const res = await app.inject({
      method: "GET",
      url: `/api/verifications/${verification.id}/status`,
      headers: authHeader(app, WALLET_2),
    });

    expect(res.statusCode).toBe(403);
  });

  it("POST /api/mina/issue-credential rejects mismatched owner wallet", async () => {
    app.minaBridge = {
      issueCredential: async () => ({ credentialJson: "{}", issuerPublicKey: WALLET_1 }),
    };

    const verification = await app.store.createVerification(WALLET_1, "provider-session-issue");
    await app.store.upsertClaims(WALLET_1, verification.id, { ageOver18: true, kycPassed: true });

    const res = await app.inject({
      method: "POST",
      url: "/api/mina/issue-credential",
      headers: {
        "content-type": "application/json",
        ...authHeader(app, WALLET_1),
      },
      payload: JSON.stringify({ userId: WALLET_1, ownerPublicKey: WALLET_2 }),
    });

    expect(res.statusCode).toBe(403);
  });
});

function shortenFloats(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(shortenFloats);
  }

  if (data !== null && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, shortenFloats(value)])
    );
  }

  if (typeof data === "number" && !Number.isInteger(data) && data % 1 === 0) {
    return Math.trunc(data);
  }

  return data;
}

function sortKeys(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(sortKeys);
  }

  if (data !== null && typeof data === "object") {
    return Object.keys(data as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortKeys((data as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return data;
}
