export {};

declare global {
  interface Window {
    mina?: {
      requestAccounts: () => Promise<string[]>;
      getAccounts?: () => Promise<string[]>;
      storePrivateCredential: (args: { credential: unknown }) => Promise<unknown>;
    };
  }
}
