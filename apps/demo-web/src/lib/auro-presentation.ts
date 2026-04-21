import {
  buildHolderBindingMessage,
  createPresentationEnvelope,
  warmUpPresentationTools,
} from "@mintra/verifier-core";
import type {
  HolderBinding,
  PresentationEnvelope,
  PresentationRequestEnvelope,
} from "@mintra/sdk-types";
import { requestPasskeyAssertion } from "./passkeys";

function isProviderError(
  value:
    | {
        presentation?: string;
        publicKey?: string;
        data?: string;
        signature?: {
          field: string;
          scalar: string;
        };
      }
    | AuroProviderError
): value is AuroProviderError {
  return "code" in value;
}

export { warmUpPresentationTools };

export async function requestPresentationWithHolderBinding(params: {
  provider: NonNullable<Window["mina"]>;
  requestEnvelope: PresentationRequestEnvelope;
  walletAddress: string;
  verifierUrl: string;
  walletProviderName?: string;
  clientVersion?: string;
}): Promise<PresentationEnvelope> {
  const proof = await params.provider.requestPresentation({
    presentation: {
      presentationRequest: params.requestEnvelope.presentationRequest,
    },
  });

  if (isProviderError(proof) || !proof.presentation) {
    throw new Error(normalizeProviderError(proof, "Auro could not create the presentation."));
  }

  const holderBindingMessage = await buildHolderBindingMessage(
    params.requestEnvelope.challenge,
    proof.presentation,
    params.walletAddress
  );

  const signed = await params.provider.signMessage({ message: holderBindingMessage });
  if (isProviderError(signed) || !signed.signature || !signed.publicKey) {
    throw new Error(
      normalizeProviderError(signed, "Auro could not sign the holder-binding challenge.")
    );
  }

  if (signed.publicKey !== params.walletAddress) {
    throw new Error("Reconnect the same wallet that owns the credential.");
  }

  const holderBinding: HolderBinding = {
    method: "mina:signMessage",
    publicKey: signed.publicKey,
    message: holderBindingMessage,
    signature: signed.signature,
    signedAt: new Date().toISOString(),
  };

  const passkeyBinding = await requestPasskeyAssertion({
    verifierUrl: params.verifierUrl,
    challengeId: params.requestEnvelope.challenge.challengeId,
    walletAddress: params.walletAddress,
    presentationJson: proof.presentation,
  });

  return createPresentationEnvelope({
    requestEnvelope: params.requestEnvelope,
    presentationJson: proof.presentation,
    holderBinding,
    ...(passkeyBinding ? { passkeyBinding } : {}),
    metadata: {
      walletProvider: params.walletProviderName ?? "Auro",
      clientVersion: params.clientVersion,
    },
  });
}

function normalizeProviderError(error: AuroProviderError | { message?: string } | unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    if ((error as { code?: number }).code === 1001) return "Reconnect Auro Wallet and try again.";
    if ((error as { code?: number }).code === 1002) return "The request was rejected in Auro.";
    if ((error as { code?: number }).code === 23001) return "Auro rejected this origin. Reconnect and try again.";
    return error.message;
  }

  return fallback;
}
