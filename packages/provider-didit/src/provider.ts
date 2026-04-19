import { createHmac, timingSafeEqual } from "node:crypto";
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

// Zod infers optional fields as `string | undefined`; this helper strips undefined values
// to satisfy exactOptionalPropertyTypes when building the WebhookDecision shape.
function buildIdVerif(
  raw: {
    status: string;
    document_type?: string | undefined;
    country?: string | undefined;
    date_of_birth?: string | undefined;
    issuing_state?: string | undefined;
  } | undefined
): {
  status: string;
  document_type?: string;
  country?: string;
  date_of_birth?: string;
  issuing_state?: string;
} {
  if (!raw) return { status: "UNKNOWN" };
  const result: {
    status: string;
    document_type?: string;
    country?: string;
    date_of_birth?: string;
    issuing_state?: string;
  } = {
    status: raw.status,
  };
  if (raw.document_type !== undefined) result.document_type = raw.document_type;
  if (raw.country !== undefined) result.country = raw.country;
  if (raw.date_of_birth !== undefined) result.date_of_birth = raw.date_of_birth;
  if (raw.issuing_state !== undefined) result.issuing_state = raw.issuing_state;
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
    console.log("[didit] session response:", JSON.stringify(raw));
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
      date_of_birth?: string;
      issuing_state?: string;
    };
    const idApproved = normalizeStatus(idVerif.status) === "approved";
    const isAdult = hasReachedAge(idVerif.date_of_birth, 18);

    const claims: NormalizedClaims = {};

    if (approved) {
      claims.kyc_passed = true;
    }
    if (isAdult || idApproved) {
      claims.age_over_18 = true;
    }
    const countrySource = idVerif.country ?? mapIso3ToIso2(idVerif.issuing_state);
    if (countrySource) {
      const code = countrySource.toUpperCase().slice(0, 2);
      if (code.length === 2) {
        claims.country_code = code;
      }
    }

    return claims;
  }

  private verifySignature(request: IncomingWebhook & { parsedBody: unknown }): void {
    const { rawBody, parsedBody, signature, signatureV2, signatureSimple, timestamp } = request;

    if (!timestamp) {
      throw new Error("Missing webhook timestamp");
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const incomingTime = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(incomingTime) || Math.abs(currentTime - incomingTime) > 300) {
      throw new Error("Webhook timestamp is stale");
    }

    if (signatureV2 && this.compareSignature(this.buildV2Signature(parsedBody), signatureV2)) {
      return;
    }

    if (signatureSimple && this.compareSignature(this.buildSimpleSignature(parsedBody), signatureSimple)) {
      return;
    }

    if (signature && this.compareSignature(this.buildRawSignature(rawBody), signature)) {
      return;
    }

    throw new Error("Webhook signature verification failed");
  }

  private buildRawSignature(rawBody: Buffer): string {
    return createHmac("sha256", this.config.webhookSecret).update(rawBody).digest("hex");
  }

  private buildV2Signature(parsedBody: unknown): string {
    const canonicalJson = JSON.stringify(sortKeys(shortenFloats(parsedBody)));
    return createHmac("sha256", this.config.webhookSecret).update(canonicalJson, "utf8").digest("hex");
  }

  private buildSimpleSignature(parsedBody: unknown): string {
    const body = parsedBody as Record<string, unknown>;
    const canonicalString = [
      body["timestamp"] ?? "",
      body["session_id"] ?? "",
      body["status"] ?? "",
      body["webhook_type"] ?? "",
    ].join(":");

    return createHmac("sha256", this.config.webhookSecret).update(canonicalString).digest("hex");
  }

  private compareSignature(expected: string, received: string): boolean {
    const normalizedExpected = expected.trim().toLowerCase();
    const normalizedReceived = received.trim().replace(/^sha256=/i, "").toLowerCase();
    const expectedBuf = Buffer.from(normalizedExpected, "utf8");
    const receivedBuf = Buffer.from(normalizedReceived, "utf8");
    return expectedBuf.length === receivedBuf.length &&
      expectedBuf.length > 0 &&
      timingSafeEqual(expectedBuf, receivedBuf);
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

function hasReachedAge(dateOfBirth: string | undefined, minimumAge: number): boolean {
  if (!dateOfBirth) return false;
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return false;

  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  const dayDelta = now.getUTCDate() - dob.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age >= minimumAge;
}

function mapIso3ToIso2(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  const isoMap: Record<string, string> = {
    USA: "US",
    GBR: "GB",
    DEU: "DE",
    ESP: "ES",
    FRA: "FR",
    ITA: "IT",
    NLD: "NL",
    BEL: "BE",
    AUT: "AT",
    CHE: "CH",
    PRT: "PT",
    GRC: "GR",
    CZE: "CZ",
    POL: "PL",
    ROU: "RO",
    BGR: "BG",
    HRV: "HR",
    HUN: "HU",
    SVN: "SI",
    SVK: "SK",
    IRL: "IE",
    DNK: "DK",
    SWE: "SE",
    NOR: "NO",
    FIN: "FI",
    CAN: "CA",
    AUS: "AU",
    NZL: "NZ",
    MEX: "MX",
    BRA: "BR",
    ARG: "AR",
    COL: "CO",
    JPN: "JP",
    KOR: "KR",
    IND: "IN",
    CHN: "CN",
    TUR: "TR",
    UKR: "UA",
  };

  if (normalized.length === 2) return normalized;
  return isoMap[normalized];
}
