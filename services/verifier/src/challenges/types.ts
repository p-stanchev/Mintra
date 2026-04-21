import type {
  PasskeyAuthenticationRequest,
  PresentationEnvelope,
  PresentationRequestEnvelope,
  ProofProductId,
  VerifierPolicy,
} from "@mintra/sdk-types";

export type PresentationChallengeStatus = "issued" | "consumed";

export interface PresentationChallengeRecord {
  challengeId: string;
  nonce: string;
  audience: string;
  proofProductId: ProofProductId;
  policy: VerifierPolicy;
  claimRequestRef: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  status: PresentationChallengeStatus;
  requestEnvelope: PresentationRequestEnvelope;
  passkeyAuthentication: PasskeyAuthenticationRequest | null;
}

export interface ConsumePresentationChallengeSuccess {
  ok: true;
  record: PresentationChallengeRecord;
}

export interface ConsumePresentationChallengeFailure {
  ok: false;
  reason: "not_found" | "already_consumed";
  record?: PresentationChallengeRecord;
}

export type ConsumePresentationChallengeResult =
  | ConsumePresentationChallengeSuccess
  | ConsumePresentationChallengeFailure;

export interface PresentationChallengeStore {
  issue(record: PresentationChallengeRecord): Promise<void>;
  get(challengeId: string): Promise<PresentationChallengeRecord | null>;
  updatePasskeyAuthentication(
    challengeId: string,
    authentication: PasskeyAuthenticationRequest
  ): Promise<PresentationChallengeRecord | null>;
  consume(challengeId: string, consumedAt: string): Promise<ConsumePresentationChallengeResult>;
  close(): Promise<void>;
}

export interface ChallengeValidationError {
  statusCode: 403 | 404 | 409;
  code:
    | "unknown_challenge"
    | "expired_challenge"
    | "challenge_replay"
    | "challenge_audience_mismatch"
    | "challenge_nonce_mismatch"
    | "challenge_request_mismatch";
  message: string;
}

export interface ChallengeValidationSuccess {
  ok: true;
  record: PresentationChallengeRecord;
}

export type ChallengeValidationResult = ChallengeValidationSuccess | {
  ok: false;
  error: ChallengeValidationError;
};

export interface ValidateChallengeForPresentationParams {
  envelope: PresentationEnvelope;
  audience: string;
  now?: Date;
}
