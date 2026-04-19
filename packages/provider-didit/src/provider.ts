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
  raw: { status: string; document_type?: string | undefined; country?: string | undefined } | undefined
): { status: string; document_type?: string; country?: string } {
  if (!raw) return { status: "UNKNOWN" };
  const result: { status: string; document_type?: string; country?: string } = {
    status: raw.status,
  };
  if (raw.document_type !== undefined) result.document_type = raw.document_type;
  if (raw.country !== undefined) result.country = raw.country;
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
    this.verifySignature(request.rawBody, request.signature);

    let json: unknown;
    try {
      json = JSON.parse(request.rawBody.toString("utf-8"));
    } catch {
      throw new Error("Webhook body is not valid JSON");
    }

    const payload = DiditWebhookPayloadSchema.parse(json);

    const decision = payload.decision;

    return {
      sessionId: payload.session_id,
      userId: payload.vendor_data ?? "",
      rawStatus: payload.status,
      decision: {
        id_verification: buildIdVerif(decision?.id_verification),
        ...(decision?.face_match !== undefined
          ? { face_match: { status: decision.face_match.status } }
          : {}),
        ...(decision?.liveness !== undefined
          ? { liveness: { status: decision.liveness.status } }
          : {}),
      },
    };
  }

  mapClaims(event: NormalizedWebhookEvent): NormalizedClaims {
    const approved = event.rawStatus === "Approved";
    const idVerif = event.decision.id_verification;
    const idApproved = idVerif.status === "APPROVED";

    const claims: NormalizedClaims = {};

    if (approved) {
      claims.kyc_passed = true;
    }
    if (idApproved) {
      claims.age_over_18 = true;
    }
    if (idVerif.country) {
      const code = idVerif.country.toUpperCase().slice(0, 2);
      if (code.length === 2) {
        claims.country_code = code;
      }
    }

    return claims;
  }

  private verifySignature(rawBody: Buffer, signature: string): void {
    // Didit x-signature-v2: HMAC-SHA256 of the raw JSON string
    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(rawBody)
      .digest("hex");

    const normalizedSig = signature.replace(/^sha256=/, "").toLowerCase();

    let expectedBuf: Buffer;
    let receivedBuf: Buffer;
    try {
      expectedBuf = Buffer.from(expected, "hex");
      receivedBuf = Buffer.from(normalizedSig, "hex");
    } catch {
      throw new Error("Webhook signature has invalid hex encoding");
    }

    if (expectedBuf.length !== receivedBuf.length || expectedBuf.length === 0) {
      throw new Error("Webhook signature length mismatch");
    }
    if (!timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new Error("Webhook signature verification failed");
    }
  }
}

export function createDiditProvider(config: DiditProviderConfig): DiditProvider {
  return new DiditProvider(config);
}
