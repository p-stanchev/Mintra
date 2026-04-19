import type { NormalizedClaims } from "./verification";

export interface CreateSessionInput {
  userId: string;
  redirectUrl?: string;
}

export interface CreateSessionResult {
  sessionId: string;
  sessionToken: string;
  verificationUrl: string;
}

export interface WebhookDecision {
  id_verification: {
    status: string;
    document_type?: string;
    country?: string;
    date_of_birth?: string;
    issuing_state?: string;
    issuing_country?: string;
  };
  face_match?: { status: string };
  liveness?: { status: string };
}

export interface IncomingWebhook {
  rawBody: Buffer;
  parsedBody?: unknown;
  signature?: string;
  signatureV2?: string;
  signatureSimple?: string;
  timestamp?: string;
}

export interface NormalizedWebhookEvent {
  sessionId: string;
  userId: string;
  rawStatus: string;
  decision: WebhookDecision;
}

export interface VerificationProvider {
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  parseWebhook(request: IncomingWebhook): Promise<NormalizedWebhookEvent>;
  mapClaims(event: NormalizedWebhookEvent): NormalizedClaims;
}
