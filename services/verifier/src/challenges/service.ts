import {
  createPresentationRequest,
  type VerifierPolicy,
} from "@mintra/verifier-core";
import type {
  PasskeyAuthenticationRequest,
  PresentationEnvelope,
  PresentationRequestEnvelope,
  ProofProductId,
} from "@mintra/sdk-types";
import type {
  ChallengeValidationResult,
  PresentationChallengeRecord,
  PresentationChallengeStore,
  ValidateChallengeForPresentationParams,
} from "./types";

export interface IssuePresentationChallengeOptions {
  proofProductId?: ProofProductId;
  policy?: VerifierPolicy;
  audience: string;
  verifier: string;
  subjectId?: string;
  walletAddress?: string | null;
  requirePasskeyBinding?: boolean;
  action?: string;
  expiresInSeconds?: number;
}

export class PresentationChallengeService {
  constructor(private readonly store: PresentationChallengeStore) {}

  async issue(
    options: IssuePresentationChallengeOptions
  ): Promise<PresentationChallengeRecord> {
    const requestEnvelope = await createPresentationRequest({
      audience: options.audience,
      verifier: options.verifier,
      ...(options.subjectId === undefined ? {} : { subjectId: options.subjectId }),
      ...(options.walletAddress === undefined ? {} : { walletAddress: options.walletAddress }),
      ...(options.requirePasskeyBinding === undefined
        ? {}
        : { requirePasskeyBinding: options.requirePasskeyBinding }),
      ...(options.proofProductId === undefined ? {} : { proofProductId: options.proofProductId }),
      ...(options.policy === undefined ? {} : { policy: options.policy }),
      ...(options.action === undefined ? {} : { action: options.action }),
      ...(options.expiresInSeconds === undefined
        ? {}
        : { expiresInSeconds: options.expiresInSeconds }),
    });

    const record = toChallengeRecord(requestEnvelope);
    await this.store.issue(record);
    return record;
  }

  async get(challengeId: string): Promise<PresentationChallengeRecord | null> {
    return this.store.get(challengeId);
  }

  async setPasskeyAuthentication(
    challengeId: string,
    authentication: PasskeyAuthenticationRequest
  ): Promise<PresentationChallengeRecord | null> {
    return this.store.updatePasskeyAuthentication(challengeId, authentication);
  }

  async validateForPresentation(
    params: ValidateChallengeForPresentationParams
  ): Promise<ChallengeValidationResult> {
    const record = await this.store.get(params.envelope.challenge.challengeId);
    const now = params.now ?? new Date();

    if (!record) {
      return {
        ok: false,
        error: inferMissingChallengeError(params.envelope, now),
      };
    }

    if (new Date(record.expiresAt).getTime() <= now.getTime()) {
      return {
        ok: false,
        error: {
          statusCode: 403,
          code: "expired_challenge",
          message: "Presentation challenge expired before verification",
        },
      };
    }

    if (record.status === "consumed") {
      return {
        ok: false,
        error: {
          statusCode: 409,
          code: "challenge_replay",
          message: "Presentation challenge was already consumed",
        },
      };
    }

    if (record.audience !== params.audience || params.envelope.challenge.audience !== params.audience) {
      return {
        ok: false,
        error: {
          statusCode: 403,
          code: "challenge_audience_mismatch",
          message: "Presentation challenge audience does not match this verifier",
        },
      };
    }

    if (record.nonce !== params.envelope.challenge.nonce) {
      return {
        ok: false,
        error: {
          statusCode: 403,
          code: "challenge_nonce_mismatch",
          message: "Presentation challenge nonce does not match the issued challenge",
        },
      };
    }

    if (
      record.claimRequestRef !== params.envelope.challenge.claimRequestRef ||
      record.requestEnvelope.presentationRequestJson !== params.envelope.proof.presentationRequestJson
    ) {
      return {
        ok: false,
        error: {
          statusCode: 403,
          code: "challenge_request_mismatch",
          message: "Presentation challenge does not match the issued verifier request",
        },
      };
    }

    const consumed = await this.store.consume(record.challengeId, now.toISOString());
    if (!consumed.ok) {
      if (consumed.reason === "already_consumed") {
        return {
          ok: false,
          error: {
            statusCode: 409,
            code: "challenge_replay",
            message: "Presentation challenge was already consumed",
          },
        };
      }

      return {
        ok: false,
        error: inferMissingChallengeError(params.envelope, now),
      };
    }

    return {
      ok: true,
      record: consumed.record,
    };
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}

export function toChallengeRecord(
  requestEnvelope: PresentationRequestEnvelope
): PresentationChallengeRecord {
  return {
    challengeId: requestEnvelope.challenge.challengeId,
    nonce: requestEnvelope.challenge.nonce,
    audience: requestEnvelope.challenge.audience,
    proofProductId: requestEnvelope.challenge.proofProductId,
    policy: requestEnvelope.challenge.policy,
    claimRequestRef: requestEnvelope.challenge.claimRequestRef,
    createdAt: requestEnvelope.challenge.issuedAt,
    expiresAt: requestEnvelope.challenge.expiresAt,
    consumedAt: null,
    status: "issued",
    requestEnvelope,
    passkeyAuthentication: null,
  };
}

function inferMissingChallengeError(envelope: PresentationEnvelope, now: Date) {
  if (new Date(envelope.challenge.expiresAt).getTime() <= now.getTime()) {
    return {
      statusCode: 403 as const,
      code: "expired_challenge" as const,
      message: "Presentation challenge expired before verification",
    };
  }

  return {
    statusCode: 404 as const,
    code: "unknown_challenge" as const,
    message: "Presentation challenge was not issued by this verifier",
  };
}
