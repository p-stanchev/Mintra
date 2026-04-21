import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  PasskeyAuthenticationRequest,
  PasskeyRegistrationChallenge,
} from "@mintra/sdk-types";
import { buildPasskeySignedPayload } from "@mintra/verifier-core";
import type { PresentationChallengeRecord } from "../challenges/types";
import type {
  PasskeyBindingStore,
  PendingPasskeyRegistration,
  StoredPasskeyBinding,
} from "./types";

const PASSKEY_REGISTRATION_TTL_MS = 10 * 60 * 1000;

export class PasskeyBindingService {
  constructor(private readonly store: PasskeyBindingStore) {}

  async beginRegistration(params: {
    walletAddress: string;
    audience: string;
    deviceName?: string | null;
  }): Promise<{
    registration: PasskeyRegistrationChallenge;
    options: unknown;
  }> {
    const rpId = new URL(params.audience).hostname;
    const registrationId = crypto.randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + PASSKEY_REGISTRATION_TTL_MS);
    const subjectId = params.walletAddress;
    const options = await generateRegistrationOptions({
      rpName: "Mintra",
      rpID: rpId,
      userID: bytesFromString(params.walletAddress),
      userName: params.walletAddress,
      userDisplayName: params.walletAddress,
      attestationType: "none",
      challenge: registrationId,
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });

    const pending: PendingPasskeyRegistration = {
      registrationId,
      walletAddress: params.walletAddress,
      subjectId,
      audience: params.audience,
      origin: params.audience,
      rpId,
      challenge: options.challenge,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      deviceName: params.deviceName?.trim() || null,
    };

    await this.store.issuePendingRegistration(pending);

    return {
      registration: pending,
      options,
    };
  }

  async finishRegistration(params: {
    registrationId: string;
    credential: unknown;
  }): Promise<StoredPasskeyBinding> {
    const pending = await this.store.consumePendingRegistration(params.registrationId);
    if (!pending) {
      throw new Error("Passkey registration challenge was not found or expired");
    }

    const verification = await verifyRegistrationResponse({
      response: params.credential as never,
      expectedChallenge: pending.challenge,
      expectedOrigin: pending.origin,
      expectedRPID: pending.rpId,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("Passkey registration could not be verified");
    }

    const bindingId = crypto.randomUUID();
    const now = new Date().toISOString();
    const registrationInfo = verification.registrationInfo;
    const binding: StoredPasskeyBinding = {
      bindingId,
      credentialId: registrationInfo.credentialID,
      publicKey: bytesToBase64Url(registrationInfo.credentialPublicKey),
      counter: registrationInfo.counter,
      walletAddress: pending.walletAddress,
      subjectId: pending.subjectId,
      deviceName: pending.deviceName,
      transports: [],
      createdAt: now,
      updatedAt: now,
      rpId: pending.rpId,
      origin: pending.origin,
    };

    await this.store.upsertBinding(binding);
    return binding;
  }

  async getBindingForWallet(walletAddress: string) {
    return this.store.getBindingForWallet(walletAddress);
  }

  async getBindingById(bindingId: string) {
    return this.store.getBindingById(bindingId);
  }

  async updateBindingCounter(bindingId: string, counter: number) {
    await this.store.updateBindingCounter(bindingId, counter, new Date().toISOString());
  }

  async buildAuthenticationRequest(params: {
    challengeRecord: PresentationChallengeRecord;
    walletAddress: string;
    presentationJson: string;
  }): Promise<PasskeyAuthenticationRequest | null> {
    const binding = await this.store.getBindingForWallet(params.walletAddress);
    if (!binding) {
      return null;
    }

    const signedPayload = await buildPasskeySignedPayload({
      challenge: params.challengeRecord.requestEnvelope.challenge,
      presentationJson: params.presentationJson,
      ownerPublicKey: params.walletAddress,
    });

    const options = await generateAuthenticationOptions({
      rpID: binding.rpId,
      challenge: bytesToBase64Url(bytesFromString(JSON.stringify(signedPayload))),
      allowCredentials: [
        {
          id: binding.credentialId,
          transports: binding.transports as never,
        },
      ],
      userVerification: "required",
    });

    return {
      bindingId: binding.bindingId,
      rpId: binding.rpId,
      origin: binding.origin,
      challenge: options.challenge,
      userVerification: "required",
      timeoutMs: typeof options.timeout === "number" ? options.timeout : 60_000,
      allowCredentialIds: [binding.credentialId],
      signedPayload,
    };
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}

function bytesFromString(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
