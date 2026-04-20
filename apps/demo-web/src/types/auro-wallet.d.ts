export {};

declare global {
  interface AuroProviderError {
    code: number;
    message: string;
    data?: unknown;
  }

  interface Window {
    mina?: {
      requestAccounts: () => Promise<string[]>;
      getAccounts?: () => Promise<string[]>;
      signMessage: (args: { message: string }) => Promise<{
        publicKey: string;
        data: string;
        signature: {
          field: string;
          scalar: string;
        };
      } | AuroProviderError>;
      storePrivateCredential: (args: { credential: unknown }) => Promise<unknown>;
      requestPresentation: (args: {
        presentation: {
          presentationRequest: unknown;
          zkAppAccount?: unknown;
        };
      }) => Promise<{
        presentation: string;
      } | AuroProviderError>;
    };
  }
}
