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
import type { MinaWalletAdapter } from "./mina-wallet";
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
    | MinaProviderError
): value is MinaProviderError {
  return "code" in value;
}

export { warmUpPresentationTools };

export async function requestPresentationWithHolderBinding(params: {
  provider: MinaWalletAdapter;
  requestEnvelope: PresentationRequestEnvelope;
  walletAddress: string;
  verifierUrl: string;
  walletProviderName?: string;
  clientVersion?: string;
}): Promise<PresentationEnvelope> {
  const proof = await withTimeout(
    params.provider.requestPresentation({
      presentation: {
        presentationRequest: params.requestEnvelope.presentationRequest,
      },
    }),
    120000,
    `${params.provider.name} took too long to create the presentation. Reopen the wallet and try again.`
  );

  if (isProviderError(proof) || !proof.presentation) {
    throw new Error(
      normalizeProviderError(proof, `${params.provider.name} could not create the presentation.`)
    );
  }

  const holderBindingMessage = await buildHolderBindingMessage(
    params.requestEnvelope.challenge,
    proof.presentation,
    params.walletAddress
  );

  const signed = await withTimeout(
    params.provider.signMessage({ message: holderBindingMessage }),
    30000,
    `${params.provider.name} took too long to sign the holder-binding challenge. Reopen the wallet and try again.`
  );
  if (isProviderError(signed) || !signed.signature || !signed.publicKey) {
    throw new Error(
      normalizeProviderError(
        signed,
        `${params.provider.name} could not sign the holder-binding challenge.`
      )
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
      walletProvider: params.walletProviderName ?? params.provider.name,
      clientVersion: params.clientVersion,
    },
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function normalizeProviderError(
  error: MinaProviderError | { message?: string } | unknown,
  fallback: string
) {
  if (Array.isArray(error)) {
    const firstMessage = error.find(
      (entry): entry is { message: string } =>
        Boolean(entry && typeof entry === "object" && "message" in entry && typeof (entry as { message?: unknown }).message === "string")
    )?.message;
    if (firstMessage?.includes("Expected array, received object")) {
      return "This wallet rejected the proof request format. Reopen the wallet and try again.";
    }
    if (firstMessage?.includes("Expected object, received string")) {
      return "This wallet rejected the credential payload format. Reopen the wallet and try again.";
    }
    if (firstMessage) return firstMessage;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    if ((error as { code?: number }).code === 4100) return "Wrong password. Unlock the wallet and try again.";
    if ((error as { code?: number }).code === 1001) return "Reconnect the wallet and try again.";
    if ((error as { code?: number }).code === 1002) return "The request was rejected in the wallet.";
    if ((error as { code?: number }).code === 23001) return "The wallet rejected this origin. Reconnect and try again.";
    if (error.message.includes("Unauthorized: signPayload")) {
      return "Wrong password or locked wallet. Unlock Pallad and try again.";
    }
    return error.message;
  }

  return fallback;
}
