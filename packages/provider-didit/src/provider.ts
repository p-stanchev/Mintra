import { createHmac, timingSafeEqual } from "node:crypto";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json" with { type: "json" };
import type {
  ClaimMaterialization,
  VerificationProvider,
  CreateSessionInput,
  CreateSessionResult,
  IncomingWebhook,
  NormalizedWebhookEvent,
  NormalizedClaims,
} from "@mintra/sdk-types";
import {
  commitDOB,
  commitString,
  createDerivedClaim,
} from "@mintra/credential-v2";
import {
  createCountryCodeZkSourceCommitment,
  createDateOfBirthZkSourceCommitment,
  createKycPassedZkSourceCommitment,
} from "@mintra/zk-claims";
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
    expiration_date?: string | undefined;
    nationality?: string | undefined;
    issuing_state?: string | undefined;
    issuing_country?: string | undefined;
  } | undefined
): {
  status: string;
  age?: number | string;
  document_type?: string;
  country?: string;
  date_of_birth?: string;
  expiration_date?: string;
  nationality?: string;
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
    expiration_date?: string;
    nationality?: string;
    issuing_state?: string;
    issuing_country?: string;
  } = {
    status: raw.status,
  };
  if (raw.age !== undefined) result.age = raw.age;
  if (raw.document_type !== undefined) result.document_type = raw.document_type;
  if (raw.country !== undefined) result.country = raw.country;
  if (raw.date_of_birth !== undefined) result.date_of_birth = raw.date_of_birth;
  if (raw.expiration_date !== undefined) result.expiration_date = raw.expiration_date;
  if (raw.nationality !== undefined) result.nationality = raw.nationality;
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
    const materialized = deriveClaimMaterial(event);
    return materialized.normalizedClaims;
  }

  async materializeClaims(event: NormalizedWebhookEvent): Promise<ClaimMaterialization> {
    const materialized = deriveClaimMaterial(event);
    const sourceCommitments: ClaimMaterialization["sourceCommitments"] = {};

    const idVerif = event.decision.id_verification as typeof event.decision.id_verification & {
      date_of_birth?: string;
      expiration_date?: string;
      nationality?: string;
      document_type?: string;
      country?: string;
      issuing_state?: string;
      issuing_country?: string;
    };

    if (typeof idVerif.date_of_birth === "string" && idVerif.date_of_birth.trim()) {
      sourceCommitments["dob_commitment"] = await commitDOB(idVerif.date_of_birth);
      const normalizedDob = normalizeDateOnly(idVerif.date_of_birth);
      if (normalizedDob) {
        const [yearString, monthString, dayString] = normalizedDob.split("-");
        sourceCommitments["dob_poseidon_commitment"] = createDateOfBirthZkSourceCommitment({
          year: Number(yearString),
          month: Number(monthString),
          day: Number(dayString),
          salt: deriveZkSalt(this.config.webhookSecret, event.userId, "dob"),
        });
      }
    }

    if (materialized.normalizedClaims.kyc_passed === true) {
      sourceCommitments["kyc_passed_poseidon_commitment"] = createKycPassedZkSourceCommitment({
        kycPassed: true,
        salt: deriveZkSalt(this.config.webhookSecret, event.userId, "kyc"),
      });
    }

    const countryCode = materialized.normalizedClaims.country_code;
    if (countryCode) {
      sourceCommitments["country_code_commitment"] = await commitString(
        "country_code_commitment",
        countryCode
      );
      const numericCountry = Number(countries.alpha2ToNumeric(countryCode) ?? 0);
      if (numericCountry > 0) {
        sourceCommitments["country_code_poseidon_commitment"] = createCountryCodeZkSourceCommitment({
          countryCodeNumeric: numericCountry,
          salt: deriveZkSalt(this.config.webhookSecret, event.userId, "country"),
        });
      }
    }

    return {
      claimModelVersion: "v2",
      normalizedClaims: materialized.normalizedClaims,
      derivedClaims: materialized.derivedClaims,
      sourceCommitments,
      ...(normalizeDateOnly(idVerif.date_of_birth) ? { dateOfBirth: normalizeDateOnly(idVerif.date_of_birth)! } : {}),
      ...(normalizeDateOnly(idVerif.expiration_date) ? { documentExpiresAt: normalizeDateOnly(idVerif.expiration_date)! } : {}),
      ...(normalizeCountryToIso3(idVerif.nationality) ? { nationality: normalizeCountryToIso3(idVerif.nationality)! } : {}),
    };
  }
  getZkSalt(userId: string, claimType: "dob" | "kyc" | "country"): bigint {
    return deriveZkSalt(this.config.webhookSecret, userId, claimType);
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

function deriveClaimMaterial(event: NormalizedWebhookEvent): {
  normalizedClaims: NormalizedClaims;
  derivedClaims: ClaimMaterialization["derivedClaims"];
} {
  const approved = normalizeStatus(event.rawStatus) === "approved";
  const idVerif = event.decision.id_verification as typeof event.decision.id_verification & {
    age?: number | string;
    date_of_birth?: string;
    expiration_date?: string;
    nationality?: string;
    issuing_state?: string;
    issuing_country?: string;
  };
  const dob = normalizeDateOnly(idVerif.date_of_birth);

  const claims: NormalizedClaims = {};
  const derivedClaims: ClaimMaterialization["derivedClaims"] = {};

  if (approved) {
    claims.kyc_passed = true;
    derivedClaims["kyc_passed"] = createDerivedClaim(
      "kyc_passed",
      true,
      ["kyc_review_commitment"],
      "provider_decision == approved",
      {
        derivationMethod: "didit.decision.approved",
        derivationVersion: "didit/v3",
        assuranceLevel: "high",
        evidenceClass: "provider-normalized",
      }
    );
  }

  if (dob && hasReachedAge(dob, 18)) {
    claims.age_over_18 = true;
    derivedClaims["age_over_18"] = createDerivedClaim(
      "age_over_18",
      true,
      ["dob_commitment"],
      "derived from source age >= 18",
      {
        derivationMethod: "didit.age-threshold.gte-18",
        derivationVersion: "didit/v3",
        assuranceLevel: "high",
        evidenceClass: "provider-normalized",
      }
    );
  }

  if (dob && hasReachedAge(dob, 21)) {
    claims.age_over_21 = true;
    derivedClaims["age_over_21"] = createDerivedClaim(
      "age_over_21",
      true,
      ["dob_commitment"],
      "derived from source age >= 21",
      {
        derivationMethod: "didit.age-threshold.gte-21",
        derivationVersion: "didit/v3",
        assuranceLevel: "high",
        evidenceClass: "provider-normalized",
      }
    );
  }

  const countryCode = normalizeCountryToIso2(
    idVerif.country,
    idVerif.issuing_country,
    idVerif.issuing_state
  );
  if (countryCode) {
    claims.country_code = countryCode;
    derivedClaims["country_code"] = createDerivedClaim(
      "country_code",
      countryCode,
      ["country_code_commitment"],
      "normalized from provider country source",
      {
        derivationMethod: "didit.country.normalize-iso2",
        derivationVersion: "didit/v3",
        assuranceLevel: "high",
        evidenceClass: "provider-normalized",
      }
    );
  }

  const nationality = normalizeCountryToIso3(idVerif.nationality);
  if (nationality) {
    claims.nationality = nationality;
  }

  return {
    normalizedClaims: claims,
    derivedClaims,
  };
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

function normalizeDateOnly(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function hasReachedAge(dateOfBirth: string, ageYears: number, now = new Date()): boolean {
  const dob = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime())) return false;

  const thresholdYear = now.getUTCFullYear() - ageYears;
  const thresholdMonth = now.getUTCMonth();
  const thresholdDay = now.getUTCDate();

  const dobYear = dob.getUTCFullYear();
  const dobMonth = dob.getUTCMonth();
  const dobDay = dob.getUTCDate();

  if (dobYear < thresholdYear) return true;
  if (dobYear > thresholdYear) return false;
  if (dobMonth < thresholdMonth) return true;
  if (dobMonth > thresholdMonth) return false;
  return dobDay <= thresholdDay;
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

function deriveZkSalt(secret: string, userId: string, claimType: string): bigint {
  const buf = createHmac("sha256", secret)
    .update(`mintra:zk-salt:v1:${userId}:${claimType}`)
    .digest();
  // 30 bytes = 240 bits, safely under the Poseidon field modulus (~254 bits)
  return BigInt(`0x${buf.subarray(0, 30).toString("hex")}`);
}

function normalizeCountryToIso3(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return undefined;
  if (normalized.length === 3) return normalized;
  const alpha2 = normalizeCountryToIso2(normalized);
  return alpha2 ? countries.alpha2ToAlpha3(alpha2)?.toUpperCase() : undefined;
}
