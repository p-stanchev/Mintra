import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresentationChallengeService } from "../challenges/service";
import { MemoryPresentationChallengeStore } from "../challenges/memory-store";
import type {
  PresentationEnvelope,
  PresentationRequestEnvelope,
} from "@mintra/sdk-types";

const { mockCreatePresentationRequest } = vi.hoisted(() => ({
  mockCreatePresentationRequest: vi.fn(),
}));

vi.mock("@mintra/verifier-core", () => ({
  createPresentationRequest: mockCreatePresentationRequest,
}));

describe("PresentationChallengeService", () => {
  beforeEach(() => {
    mockCreatePresentationRequest.mockReset();
    mockCreatePresentationRequest.mockImplementation(async () => createRequestEnvelope());
  });

  it("issues a challenge that can be read back", async () => {
    const service = new PresentationChallengeService(new MemoryPresentationChallengeStore());
    const issued = await service.issue({
      proofProductId: "proof_of_age_18",
      audience: "https://example.com",
      verifier: "https://verifier.example.com",
    });

    const loaded = await service.get(issued.challengeId);
    expect(loaded?.challengeId).toBe(issued.challengeId);
    expect(loaded?.status).toBe("issued");
  });

  it("returns a normalized replay error after the challenge has been consumed", async () => {
    const service = new PresentationChallengeService(new MemoryPresentationChallengeStore());
    const issued = await service.issue({
      proofProductId: "proof_of_age_18",
      audience: "https://example.com",
      verifier: "https://verifier.example.com",
    });
    const envelope = createPresentationEnvelope(issued.requestEnvelope);

    const first = await service.validateForPresentation({
      envelope,
      audience: "https://example.com",
    });
    const second = await service.validateForPresentation({
      envelope,
      audience: "https://example.com",
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: false,
      error: {
        statusCode: 409,
        code: "challenge_replay",
        message: "Presentation challenge was already consumed",
      },
    });
  });

  it("rejects an audience mismatch", async () => {
    const service = new PresentationChallengeService(new MemoryPresentationChallengeStore());
    const issued = await service.issue({
      proofProductId: "proof_of_age_18",
      audience: "https://example.com",
      verifier: "https://verifier.example.com",
    });
    const envelope = createPresentationEnvelope(issued.requestEnvelope);

    const result = await service.validateForPresentation({
      envelope,
      audience: "https://other.example.com",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        statusCode: 403,
        code: "challenge_audience_mismatch",
        message: "Presentation challenge audience does not match this verifier",
      },
    });
  });

  it("rejects a nonce mismatch", async () => {
    const service = new PresentationChallengeService(new MemoryPresentationChallengeStore());
    const issued = await service.issue({
      proofProductId: "proof_of_age_18",
      audience: "https://example.com",
      verifier: "https://verifier.example.com",
    });
    const envelope = createPresentationEnvelope(issued.requestEnvelope, {
      challenge: {
        nonce: "tampered-nonce",
      },
    });

    const result = await service.validateForPresentation({
      envelope,
      audience: "https://example.com",
    });

    expect(result).toEqual({
      ok: false,
      error: {
        statusCode: 403,
        code: "challenge_nonce_mismatch",
        message: "Presentation challenge nonce does not match the issued challenge",
      },
    });
  });

  it("rejects expired challenges with a normalized error", async () => {
    const expiredEnvelope = createRequestEnvelope({
      challenge: {
        issuedAt: new Date(Date.now() - 10_000).toISOString(),
        expiresAt: new Date(Date.now() - 5_000).toISOString(),
      },
    });
    mockCreatePresentationRequest.mockImplementationOnce(async () => expiredEnvelope);

    const service = new PresentationChallengeService(new MemoryPresentationChallengeStore());
    const issued = await service.issue({
      proofProductId: "proof_of_age_18",
      audience: "https://example.com",
      verifier: "https://verifier.example.com",
      expiresInSeconds: 1,
    });
    const envelope = createPresentationEnvelope(issued.requestEnvelope);

    const result = await service.validateForPresentation({
      envelope,
      audience: "https://example.com",
      now: new Date(),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        statusCode: 403,
        code: "expired_challenge",
        message: "Presentation challenge expired before verification",
      },
    });
  });
});

function createPresentationEnvelope(
  requestEnvelope: PresentationRequestEnvelope,
  overrides?: {
    challenge?: Partial<PresentationEnvelope["challenge"]>;
    proof?: Partial<PresentationEnvelope["proof"]>;
  }
): PresentationEnvelope {
  return {
    version: "mintra.presentation/v1",
    challenge: {
      ...requestEnvelope.challenge,
      ...overrides?.challenge,
    },
    proof: {
      format: "mina-attestations/auro",
      presentationJson: "{\"presentation\":true}",
      presentationRequestJson: requestEnvelope.presentationRequestJson,
      ...overrides?.proof,
    },
    holderBinding: {
      method: "mina:signMessage",
      publicKey: "B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ",
      message: "holder binding",
      signature: {
        field: "1",
        scalar: "2",
      },
      signedAt: new Date().toISOString(),
    },
    metadata: {
      walletProvider: "Auro",
      submittedAt: new Date().toISOString(),
    },
  };
}

function createRequestEnvelope(
  overrides?: {
    challenge?: Partial<PresentationRequestEnvelope["challenge"]>;
  }
): PresentationRequestEnvelope {
  const challengeId = crypto.randomUUID();
  const issuedAt = overrides?.challenge?.issuedAt ?? new Date().toISOString();
  const expiresAt =
    overrides?.challenge?.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString();

  return {
    version: "mintra.presentation-request/v1",
    proofProduct: {
      id: "proof_of_age_18",
      displayName: "Proof of Age 18+",
      description: "Age proof",
      requestedClaims: ["age_over_18"],
      verificationRequirements: ["age_over_18 must be true"],
      outputFields: ["ageOver18"],
    },
    challenge: {
      version: "mintra.challenge/v1",
      challengeId,
      nonce: overrides?.challenge?.nonce ?? "nonce-123",
      verifier: overrides?.challenge?.verifier ?? "https://verifier.example.com",
      audience: overrides?.challenge?.audience ?? "https://example.com",
      action: overrides?.challenge?.action ?? "mintra:test",
      proofProductId: overrides?.challenge?.proofProductId ?? "proof_of_age_18",
      claimRequestRef: overrides?.challenge?.claimRequestRef ?? "request-ref",
      issuedAt,
      expiresAt,
      policy: overrides?.challenge?.policy ?? {
        minAge: 18,
        requireKycPassed: true,
        countryAllowlist: [],
        countryBlocklist: [],
        maxCredentialAgeDays: 30,
      },
      replayProtection: {
        challengeId,
        nonce: overrides?.challenge?.nonce ?? "nonce-123",
        singleUse: true,
        expiresAt,
      },
      holderBindingContext: {
        walletAddress: "B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ",
        subjectId: "B62qofnLEV54uzd1QR1F9SzG4gTkV9gRVL3jW8Ytn5jMiCrAcffJJMZ",
        requiredMethods: ["wallet"],
      },
    },
    presentationRequest: {
      type: "https",
    },
    presentationRequestJson: "{\"type\":\"https\"}",
    holderBindingFormat: "mina:signMessage",
    passkeyAuthentication: undefined,
  };
}
