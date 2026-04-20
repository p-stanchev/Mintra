export {};

declare global {
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
      } | {
        code: number;
        message: string;
        data?: unknown;
      }>;
      storePrivateCredential: (args: { credential: unknown }) => Promise<unknown>;
    };
  }
}
