import { createHmac } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../app";
import type { FastifyInstance } from "fastify";

const TEST_SECRET = "integration-test-secret-xyz";
const TEST_API_KEY = "integration-test-api-key";
const TEST_WORKFLOW_ID = "test-workflow-id";

function sign(body: string): string {
  return createHmac("sha256", TEST_SECRET).update(Buffer.from(body)).digest("hex");
}

function signSimple(payload: {
  timestamp?: number;
  session_id?: string;
  status?: string;
  webhook_type?: string;
}): string {
  const canonical = [
    payload.timestamp ?? "",
    payload.session_id ?? "",
    payload.status ?? "",
    payload.webhook_type ?? "",
  ].join(":");

  return createHmac("sha256", TEST_SECRET).update(canonical).digest("hex");
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
      vendor_data: "user-1",
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

  it("GET /api/claims/:userId returns empty claims for unknown user", async () => {
    const res = await app.inject({ method: "GET", url: "/api/claims/unknown-user" });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.userId).toBe("unknown-user");
    expect(data.claims).toEqual({});
    expect(data.verifiedAt).toBeNull();
  });

  it("GET /api/verifications/:id/status returns 404 for unknown id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/verifications/00000000-0000-0000-0000-000000000000/status",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/verifications/:id/status resolves provider session ids too", async () => {
    const verification = await app.store.createVerification("user-provider-ref", "provider-session-123");

    const res = await app.inject({
      method: "GET",
      url: "/api/verifications/provider-session-123/status",
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.id).toBe(verification.id);
    expect(data.providerReference).toBe("provider-session-123");
  });

  it("webhook with valid signature updates store and stores claims", async () => {
    // Seed a verification directly into the store
    const sessionId = "sess-valid-123";
    const timestamp = Math.floor(Date.now() / 1000);
    await app.store.createVerification("user-webhook", sessionId);

    const body = JSON.stringify({
      session_id: sessionId,
      status: "Approved",
      webhook_type: "status.updated",
      vendor_data: "user-webhook",
      timestamp,
      decision: { id_verification: { status: "APPROVED", country: "US" } },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/providers/didit/webhook",
      headers: {
        "content-type": "application/json",
        "x-signature-simple": signSimple({
          timestamp,
          session_id: sessionId,
          status: "Approved",
          webhook_type: "status.updated",
        }),
        "x-timestamp": String(timestamp),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);

    const claims = await app.store.getClaims("user-webhook");
    expect(claims?.kycPassed).toBe(true);
    expect(claims?.ageOver18).toBe(true);
  });

  it("webhook maps Didit v3 approved payloads with date_of_birth and issuing_state", async () => {
    const sessionId = "sess-v3-123";
    const timestamp = Math.floor(Date.now() / 1000);
    await app.store.createVerification("user-v3", sessionId);

    const payload = {
      session_id: sessionId,
      status: "Approved",
      webhook_type: "status.updated",
      vendor_data: "user-v3",
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

    const claims = await app.store.getClaims("user-v3");
    expect(claims?.kycPassed).toBe(true);
    expect(claims?.ageOver18).toBe(true);
    expect(claims?.countryCode).toBe("ES");
  });

  it("webhook with valid v2 signature is accepted", async () => {
    const sessionId = "sess-v2-123";
    const timestamp = Math.floor(Date.now() / 1000);
    await app.store.createVerification("user-v2", sessionId);

    const payload = {
      session_id: sessionId,
      status: "Approved",
      webhook_type: "status.updated",
      vendor_data: "user-v2",
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

    const claims = await app.store.getClaims("user-v2");
    expect(claims?.kycPassed).toBe(true);
    expect(claims?.countryCode).toBe("DE");
  });

  it("webhook with unmapped interim status stays pending instead of error", async () => {
    const sessionId = "sess-pending-123";
    const timestamp = Math.floor(Date.now() / 1000);
    const verification = await app.store.createVerification("user-pending", sessionId);

    const body = JSON.stringify({
      session_id: sessionId,
      status: "Not Started",
      webhook_type: "status.updated",
      timestamp,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/providers/didit/webhook",
      headers: {
        "content-type": "application/json",
        "x-signature-simple": signSimple({
          timestamp,
          session_id: sessionId,
          status: "Not Started",
          webhook_type: "status.updated",
        }),
        "x-timestamp": String(timestamp),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);

    const updated = await app.store.getVerification(verification.id);
    expect(updated?.status).toBe("pending");
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
