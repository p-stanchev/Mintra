import { createHmac, timingSafeEqual } from "node:crypto";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json" with { type: "json" };
import type {
  VerificationProvider,
  CreateSessionInput,
  CreateSessionResult,
  IncomingWebhook,
  NormalizedWebhookEvent,
  NormalizedClaims,
} from "@mintra/sdk-types";
import { DiditSessionResponseSchema, DiditWebhookPayloadSchema } from "./schemas";

const DIDIT_API_BASE = "https://verification.didit.me";
countries.registerLocale(enLocale);

// Zod infers optional fields as `string | undefined`; this helper strips undefined values
// to satisfy exactOptionalPropertyTypes when building the WebhookDecision shape.
function buildIdVerif(
  raw: {
    status: string;
    age?: number | string | undefined;
    document_type?: string | undefined;
    country?: string | undefined;
    date_of_birth?: string | undefined;
    issuing_state?: string | undefined;
    issuing_country?: string | undefined;
  } | undefined
): {
  status: string;
  age?: number | string;
  document_type?: string;
  country?: string;
  date_of_birth?: string;
  issuing_state?: string;
  issuing_country?: string;
} {
  if (!raw) return { status: "UNKNOWN" };
  const result: {
    status: string;
    age?: number | string;
    document_type?: string;
    country?: string;
    date_of_birth?: string;
    issuing_state?: string;
    issuing_country?: string;
  } = {
    status: raw.status,
  };
  if (raw.age !== undefined) result.age = raw.age;
  if (raw.document_type !== undefined) result.document_type = raw.document_type;
  if (raw.country !== undefined) result.country = raw.country;
  if (raw.date_of_birth !== undefined) result.date_of_birth = raw.date_of_birth;
  if (raw.issuing_state !== undefined) result.issuing_state = raw.issuing_state;
  if (raw.issuing_country !== undefined) result.issuing_country = raw.issuing_country;
  return result;
}

export interface DiditProviderConfig {
  apiKey: string;
  webhookSecret: string;
  workflowId: string;
}

export class DiditProvider implements VerificationProvider {
  constructor(private readonly config: DiditProviderConfig) {}

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    const body: Record<string, string> = {
      vendor_data: input.userId,
      workflow_id: this.config.workflowId,
    };
    if (input.redirectUrl) {
      body["callback"] = input.redirectUrl;
    }

    const response = await fetch(`${DIDIT_API_BASE}/v3/session/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Didit session creation failed: HTTP ${response.status} — ${text}`
      );
    }

    const raw = await response.json();
    const data = DiditSessionResponseSchema.parse(raw);
    const verificationUrl = data.verification_url ?? data.url ?? "";
    return {
      sessionId: data.session_id,
      sessionToken: data.session_token,
      verificationUrl,
    };
  }

  async parseWebhook(request: IncomingWebhook): Promise<NormalizedWebhookEvent> {
    let json: unknown;
    if (request.parsedBody !== undefined) {
      json = request.parsedBody;
    } else {
      try {
        json = JSON.parse(request.rawBody.toString("utf-8"));
      } catch {
        throw new Error("Webhook body is not valid JSON");
      }
    }

    const signatureRequest: IncomingWebhook & { parsedBody: unknown } = {
      rawBody: request.rawBody,
      parsedBody: json,
    };
    if (request.signature !== undefined) signatureRequest.signature = request.signature;
    if (request.signatureV2 !== undefined) signatureRequest.signatureV2 = request.signatureV2;
    if (request.signatureSimple !== undefined) signatureRequest.signatureSimple = request.signatureSimple;
    if (request.timestamp !== undefined) signatureRequest.timestamp = request.timestamp;

    this.verifySignature(signatureRequest);

    const payload = DiditWebhookPayloadSchema.parse(json);

    const decision = payload.decision;
    const idVerification = decision?.id_verification ?? decision?.id_verifications?.[0];
    const faceMatch = decision?.face_match ?? decision?.face_matches?.[0];
    const liveness = decision?.liveness ?? decision?.liveness_checks?.[0];

    return {
      sessionId: payload.session_id,
      userId: payload.vendor_data ?? "",
      rawStatus: payload.status,
      decision: {
        id_verification: buildIdVerif(idVerification),
        ...(faceMatch !== undefined
          ? { face_match: { status: faceMatch.status } }
          : {}),
        ...(liveness !== undefined
          ? { liveness: { status: liveness.status } }
          : {}),
      },
    };
  }

  mapClaims(event: NormalizedWebhookEvent): NormalizedClaims {
    const approved = normalizeStatus(event.rawStatus) === "approved";
    const idVerif = event.decision.id_verification as typeof event.decision.id_verification & {
      age?: number | string;
      date_of_birth?: string;
      issuing_state?: string;
      issuing_country?: string;
    };
    const age = normalizeAge(idVerif.age);

    const claims: NormalizedClaims = {};

    if (approved) {
      claims.kyc_passed = true;
    }
    if (age !== null && age >= 18) {
      claims.age_over_18 = true;
    }
    if (age !== null && age >= 21) {
      claims.age_over_21 = true;
    }
    const countryCode = normalizeCountryToIso2(
      idVerif.country,
      idVerif.issuing_country,
      idVerif.issuing_state
    );
    if (countryCode) claims.country_code = countryCode;

    return claims;
  }

  private verifySignature(request: IncomingWebhook & { parsedBody: unknown }): void {
    const { parsedBody, signatureV2, timestamp } = request;

    if (!timestamp) {
      throw new Error("Missing webhook timestamp");
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const incomingTime = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(incomingTime) || Math.abs(currentTime - incomingTime) > 60) {
      throw new Error("Webhook timestamp is stale or too far in the future");
    }

    if (!signatureV2) {
      throw new Error("Missing x-signature-v2 header");
    }

    const expected = this.buildV2Signature(parsedBody);
    if (!this.compareHmac(expected, signatureV2)) {
      throw new Error("Webhook signature verification failed");
    }
  }

  private buildV2Signature(parsedBody: unknown): string {
    const canonicalJson = JSON.stringify(sortKeys(shortenFloats(parsedBody)));
    return createHmac("sha256", this.config.webhookSecret).update(canonicalJson, "utf8").digest("hex");
  }

  // Constant-time hex HMAC comparison — both sides are always 64 hex chars (SHA-256)
  private compareHmac(expected: string, received: string): boolean {
    const normalizedReceived = received.replace(/^sha256=/i, "").toLowerCase();
    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(normalizedReceived, "hex");
    // Both must be exactly 32 bytes (64 hex chars → 32 bytes); reject anything else
    if (expectedBuf.length !== 32 || receivedBuf.length !== 32) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  }
}

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

export function createDiditProvider(config: DiditProviderConfig): DiditProvider {
  return new DiditProvider(config);
}

function normalizeStatus(status: string | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

function normalizeAge(age: number | string | undefined): number | null {
  if (typeof age === "number") {
    return Number.isFinite(age) ? age : null;
  }
  if (typeof age === "string") {
    const parsed = Number(age);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCountryToIso2(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim().toUpperCase();
    if (!normalized) continue;
    if (normalized.length === 2) return normalized;

    const alpha3 = countries.alpha3ToAlpha2(normalized);
    if (alpha3) return alpha3;

    const byName = countries.getAlpha2Code(value, "en");
    if (byName) return byName;
  }

  return undefined;
}
