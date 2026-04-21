"use client";

import type {
  PasskeyAssertion,
  PasskeyAuthenticationRequest,
} from "@mintra/sdk-types";

export async function registerPasskey(params: {
  verifierUrl: string;
  walletAddress: string;
  deviceName?: string;
}): Promise<{ bindingId: string; deviceName: string | null }> {
  const optionsResponse = await fetch(`${params.verifierUrl}/api/passkeys/register/options`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      walletAddress: params.walletAddress,
      ...(params.deviceName ? { deviceName: params.deviceName } : {}),
    }),
  });

  const optionsPayload = await optionsResponse.json().catch(async () => ({
    error: await optionsResponse.text(),
  }));
  if (!optionsResponse.ok) {
    throw new Error(optionsPayload?.error ?? "Could not create passkey registration options.");
  }

  const credential = await navigator.credentials.create({
    publicKey: toRegistrationPublicKey(optionsPayload.options),
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Browser did not return a passkey credential.");
  }

  const verifyResponse = await fetch(`${params.verifierUrl}/api/passkeys/register/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      registrationId: optionsPayload.registration.registrationId,
      credential: serializeRegistrationCredential(credential),
    }),
  });

  const verifyPayload = await verifyResponse.json().catch(async () => ({
    error: await verifyResponse.text(),
  }));
  if (!verifyResponse.ok) {
    throw new Error(verifyPayload?.error ?? "Passkey registration failed.");
  }

  return {
    bindingId: verifyPayload.binding.bindingId,
    deviceName: verifyPayload.binding.deviceName ?? null,
  };
}

export async function requestPasskeyAssertion(params: {
  verifierUrl: string;
  challengeId: string;
  walletAddress: string;
  presentationJson: string;
}): Promise<PasskeyAssertion | null> {
  const optionsResponse = await fetch(`${params.verifierUrl}/api/passkeys/assertion/options`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      challengeId: params.challengeId,
      walletAddress: params.walletAddress,
      presentationJson: params.presentationJson,
    }),
  });

  const optionsPayload = await optionsResponse.json().catch(async () => ({
    error: await optionsResponse.text(),
  }));
  if (!optionsResponse.ok) {
    if (optionsPayload?.error === "passkey_not_registered") {
      return null;
    }
    throw new Error(optionsPayload?.error ?? "Could not create passkey assertion options.");
  }

  const authentication = optionsPayload.authentication as PasskeyAuthenticationRequest;
  const credential = await navigator.credentials.get({
    publicKey: toAuthenticationPublicKey(authentication),
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Browser did not return a passkey assertion.");
  }

  return {
    bindingId: authentication.bindingId,
    credentialId: authentication.allowCredentialIds[0] ?? "",
    challenge: authentication.challenge,
    signedPayload: authentication.signedPayload,
    credential: serializeAuthenticationCredential(credential),
  };
}

function toRegistrationPublicKey(options: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  const baseOptions = options as unknown as PublicKeyCredentialCreationOptions;
  const user = options.user as PublicKeyCredentialUserEntity & { id: string };
  const excludeCredentials = Array.isArray(options.excludeCredentials)
    ? (options.excludeCredentials as Array<{ id: string; type: PublicKeyCredentialType }>)
    : [];

  return {
    ...baseOptions,
    challenge: base64UrlToBuffer(String(options.challenge)),
    user: {
      ...user,
      id: base64UrlToBuffer(String(user.id)),
    },
    excludeCredentials: excludeCredentials.map((credential) => ({
      ...credential,
      id: base64UrlToBuffer(credential.id),
    })),
  };
}

function toAuthenticationPublicKey(
  authentication: PasskeyAuthenticationRequest
): PublicKeyCredentialRequestOptions {
  return {
    rpId: authentication.rpId,
    challenge: base64UrlToBuffer(authentication.challenge),
    userVerification: authentication.userVerification,
    timeout: authentication.timeoutMs,
    allowCredentials: authentication.allowCredentialIds.map((credentialId) => ({
      id: base64UrlToBuffer(credentialId),
      type: "public-key",
    })),
  };
}

function serializeRegistrationCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults() as Record<string, unknown>,
    response: {
      attestationObject: bufferToBase64Url(response.attestationObject),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      transports: typeof response.getTransports === "function" ? response.getTransports() : [],
    },
  };
}

function serializeAuthenticationCredential(credential: PublicKeyCredential): PasskeyAssertion["credential"] {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: "public-key",
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults() as Record<string, unknown>,
    response: {
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
    },
  };
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

function bufferToBase64Url(value: ArrayBufferLike): string {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
