import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  ClaimMaterialization,
  CreateSessionInput,
  CreateSessionResult,
  IncomingWebhook,
  NormalizedClaims,
  NormalizedWebhookEvent,
  VerificationProvider,
} from "@mintra/sdk-types";
import { createDerivedClaim } from "@mintra/credential-v2";
import { createKycPassedZkSourceCommitment } from "@mintra/zk-claims";
import {
  IdNormCreateSessionResponseSchema,
  IdNormSessionResultsSchema,
  IdNormWebhookPayloadSchema,
} from "./schemas";

const IDNORM_API_BASE = "https://api.idnorm.com";

export interface IdNormProviderConfig {
  apiKey: string;
  webhookSecret: string;
  configurationId: string;
}

export class IdNormProvider implements VerificationProvider {
  readonly id = "idnorm" as const;

  constructor(private readonly config: IdNormProviderConfig) {}

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    const response = await fetch(`${IDNORM_API_BASE}/api/v1/create_session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idnorm-License-Key": this.config.apiKey,
      },
      body: JSON.stringify({
        configId: this.config.configurationId,
        externalUserId: input.userId,
        ...(input.redirectUrl === undefined ? {} : { callbackUrl: input.redirectUrl }),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`IdNorm session creation failed: HTTP ${response.status} — ${text}`);
    }

    const payload = IdNormCreateSessionResponseSchema.parse(await response.json());
    return {
      sessionId: payload.sessionId,
      sessionToken: payload.sessionToken,
      verificationUrl: payload.verificationUrl,
    };
  }

  async parseWebhook(request: IncomingWebhook): Promise<NormalizedWebhookEvent> {
    const signature = request.signature ?? request.signatureSimple;
    this.verifySignature(signature, request.rawBody);

    const parsed =
      request.parsedBody !== undefined
        ? request.parsedBody
        : JSON.parse(request.rawBody.toString("utf8"));
    const payload = IdNormWebhookPayloadSchema.parse(parsed);
    const rawStatus =
      payload.sessionUpdate?.status ??
      payload.amlUpdated?.result ??
      (payload.documentExpired ? "DOCUMENT_EXPIRED" : "STATUS_UNDEFINED");

    return {
      sessionId: payload.id,
      userId: payload.userId ?? "",
      rawStatus,
      decision: {
        id_verification: {
          status: rawStatus,
        },
      },
    };
  }

  mapVerificationStatus(event: NormalizedWebhookEvent) {
    const status = event.rawStatus.trim().toLowerCase();
    if (
      status.includes("approved") ||
      status.includes("completed") ||
      status.includes("verified")
    ) {
      return "approved";
    }
    if (
      status.includes("declined") ||
      status.includes("rejected") ||
      status.includes("failed") ||
      status.includes("expired")
    ) {
      return "rejected";
    }
    if (status.includes("review") || status.includes("manual")) {
      return "needs_review";
    }
    return "pending";
  }

  mapClaims(event: NormalizedWebhookEvent): NormalizedClaims {
    const approved = this.mapVerificationStatus(event) === "approved";
    return approved ? { kyc_passed: true } : {};
  }

  async materializeClaims(event: NormalizedWebhookEvent): Promise<ClaimMaterialization> {
    const results = await this.fetchSessionResults(event.sessionId);
    const kyc = results.kyc;
    const approved = this.mapVerificationStatus(event) === "approved";
    const normalizedClaims: NormalizedClaims = {};
    const derivedClaims: ClaimMaterialization["derivedClaims"] = {};
    const sourceCommitments: ClaimMaterialization["sourceCommitments"] = {};

    if (approved) {
      normalizedClaims.kyc_passed = true;
      derivedClaims["kyc_passed"] = createDerivedClaim(
        "kyc_passed",
        true,
        ["kyc_review_commitment"],
        "provider_decision == approved",
        {
          derivationMethod: "idnorm.decision.approved",
          derivationVersion: "idnorm/v1",
          assuranceLevel: "high",
          evidenceClass: "provider-normalized",
        }
      );
      sourceCommitments["kyc_passed_poseidon_commitment"] = createKycPassedZkSourceCommitment({
        kycPassed: true,
        salt: deriveZkSalt(this.config.webhookSecret, event.userId, "kyc"),
      });
    }

    const estimatedAge = kyc?.ageEstimate?.age;
    if (typeof estimatedAge === "number" && Number.isFinite(estimatedAge) && estimatedAge >= 18) {
      normalizedClaims.age_over_18 = true;
      derivedClaims["age_over_18"] = createDerivedClaim(
        "age_over_18",
        true,
        ["age_estimate_commitment"],
        "derived from provider age estimate >= 18",
        {
          derivationMethod: "idnorm.age-estimate.gte-18",
          derivationVersion: "idnorm/v1",
          assuranceLevel: "medium",
          evidenceClass: "provider-normalized",
        }
      );
    }
    if (typeof estimatedAge === "number" && Number.isFinite(estimatedAge) && estimatedAge >= 21) {
      normalizedClaims.age_over_21 = true;
      derivedClaims["age_over_21"] = createDerivedClaim(
        "age_over_21",
        true,
        ["age_estimate_commitment"],
        "derived from provider age estimate >= 21",
        {
          derivationMethod: "idnorm.age-estimate.gte-21",
          derivationVersion: "idnorm/v1",
          assuranceLevel: "medium",
          evidenceClass: "provider-normalized",
        }
      );
    }

    return {
      claimModelVersion: "v2",
      normalizedClaims,
      derivedClaims,
      sourceCommitments,
      credentialTrust: {
        issuerEnvironment: "production",
        issuerId: "mintra-production-issuer",
        issuerDisplayName: "Mintra",
        assuranceLevel: approved ? "high" : "medium",
        evidenceClass: "provider-normalized",
        demoCredential: false,
      },
    };
  }

  getZkSalt(userId: string, claimType: "dob" | "kyc" | "country"): bigint {
    return deriveZkSalt(this.config.webhookSecret, userId, claimType);
  }

  private async fetchSessionResults(sessionId: string) {
    const response = await fetch(`${IDNORM_API_BASE}/api/v1/session/${encodeURIComponent(sessionId)}`, {
      method: "GET",
      headers: {
        "Idnorm-License-Key": this.config.apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`IdNorm session results failed: HTTP ${response.status} — ${text}`);
    }

    return IdNormSessionResultsSchema.parse(await response.json());
  }

  private verifySignature(signatureHeader: string | undefined, rawBody: Buffer) {
    if (!signatureHeader) {
      throw new Error("Missing Idnorm-Signature header");
    }

    const [timestampText, receivedSignature] = signatureHeader.split(".");
    if (!timestampText || !receivedSignature) {
      throw new Error("Invalid Idnorm-Signature header");
    }

    const timestamp = Number.parseInt(timestampText, 10);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 300) {
      throw new Error("IdNorm webhook timestamp is stale or invalid");
    }

    const timestampBytes = Buffer.alloc(8);
    timestampBytes.writeBigUInt64BE(BigInt(timestamp), 0);
    const payload = Buffer.concat([timestampBytes, rawBody]);
    const expected = createHmac("sha256", this.config.webhookSecret).update(payload).digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(receivedSignature.toLowerCase(), "hex");
    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new Error("IdNorm webhook signature verification failed");
    }
  }
}

export function createIdNormProvider(config: IdNormProviderConfig): IdNormProvider {
  return new IdNormProvider(config);
}

function deriveZkSalt(secret: string, userId: string, claimType: string): bigint {
  const buf = createHmac("sha256", secret)
    .update(`mintra:zk-salt:v1:${userId}:${claimType}`)
    .digest();
  return BigInt(`0x${buf.subarray(0, 30).toString("hex")}`);
}
