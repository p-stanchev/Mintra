export {};

declare global {
  interface MinaProviderError {
    code?: number;
    message?: string;
    data?: unknown;
  }

  interface MinaSignedMessage {
    publicKey: string;
    data: string;
    signature: {
      field: string;
      scalar: string;
    };
  }

  interface MinaPresentationResponse {
    presentation: string;
  }

  interface MinaDirectProvider {
    requestAccounts?: () => Promise<string[]>;
    getAccounts?: () => Promise<string[]>;
    signMessage?: (args: { message: string }) => Promise<MinaSignedMessage | MinaProviderError>;
    storePrivateCredential?: (args: { credential: unknown }) => Promise<unknown>;
    requestPresentation?: (args: {
      presentation: {
        presentationRequest: unknown;
        zkAppAccount?: unknown;
      };
    }) => Promise<MinaPresentationResponse | MinaProviderError>;
    request?: (args: {
      method: string;
      params?: unknown;
    }) => Promise<unknown>;
  }

  interface MinaAnnouncedProviderInfo {
    slug?: string;
    name?: string;
  }

  interface MinaAnnouncedProviderDetail {
    info?: MinaAnnouncedProviderInfo;
    provider?: MinaDirectProvider;
  }

  interface Window {
    mina?: MinaDirectProvider;
    clorio?: MinaDirectProvider;
    pallad?: MinaDirectProvider;
  }

  interface WindowEventMap {
    "mina:announceProvider": CustomEvent<MinaAnnouncedProviderDetail>;
  }
}
