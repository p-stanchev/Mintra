"use client";

export type MinaWalletCapability = "connect" | "signMessage" | "requestPresentation" | "storeCredential";

export interface MinaWalletAdapter {
  id: string;
  name: string;
  source: "direct" | "announced";
  capabilities: Record<MinaWalletCapability, boolean>;
  requestAccounts(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
  signMessage(args: { message: string }): Promise<MinaSignedMessage | MinaProviderError>;
  requestPresentation(args: {
    presentation: {
      presentationRequest: unknown;
      zkAppAccount?: unknown;
    };
  }): Promise<MinaPresentationResponse | MinaProviderError>;
  storePrivateCredential(args: { credential: unknown }): Promise<unknown>;
}

export type MinaWalletSummary = Pick<MinaWalletAdapter, "id" | "name" | "source" | "capabilities">;

const KNOWN_WALLET_NAMES: Record<string, string> = {
  auro: "Auro",
  pallad: "Pallad",
  clorio: "Clorio",
  mina: "Mina Wallet",
};

const WALLET_ID_ALIASES: Record<string, string> = {
  "auro-wallet": "auro",
  "auro-wallet-provider": "auro",
  "pallad-wallet": "pallad",
  "clorio-wallet": "clorio",
};

export async function discoverMinaWallets(): Promise<MinaWalletAdapter[]> {
  if (typeof window === "undefined") return [];

  const wallets = new Map<string, MinaWalletAdapter>();
  const providerIds = new WeakMap<object, string>();

  for (const announced of await collectAnnouncedProviders()) {
    const announcedProvider = announced.provider;
    if (!announcedProvider) continue;
    const adapter = createAdapterFromProvider({
      id: normalizeWalletId(announced.info?.slug ?? announced.info?.name ?? "announced-wallet"),
      name: announced.info?.name ?? inferWalletName(announced.info?.slug),
      provider: announcedProvider,
      source: "announced",
    });
    upsertWallet(wallets, providerIds, adapter, announcedProvider);
  }

  const directCandidates: Array<{ id: string; provider: MinaDirectProvider | undefined }> = [
    { id: "auro", provider: window.mina },
    { id: "clorio", provider: window.clorio },
    { id: "pallad", provider: window.pallad },
  ];

  for (const candidate of directCandidates) {
    if (!candidate.provider) continue;
    const adapter = createAdapterFromProvider({
      id: candidate.id,
      name: inferWalletName(candidate.id),
      provider: candidate.provider,
      source: "direct",
    });
    upsertWallet(wallets, providerIds, adapter, candidate.provider);
  }

  return Array.from(wallets.values()).sort((left, right) => {
    const order = ["auro", "pallad", "clorio"];
    const leftIndex = order.indexOf(left.id);
    const rightIndex = order.indexOf(right.id);
    if (leftIndex === -1 && rightIndex === -1) return left.name.localeCompare(right.name);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

function upsertWallet(
  wallets: Map<string, MinaWalletAdapter>,
  providerIds: WeakMap<object, string>,
  candidate: MinaWalletAdapter,
  provider: MinaDirectProvider
) {
  const existingByProviderId = providerIds.get(provider as object);
  if (existingByProviderId) {
    const existing = wallets.get(existingByProviderId);
    if (!existing) {
      wallets.set(candidate.id, candidate);
      providerIds.set(provider as object, candidate.id);
      return;
    }

    const preferred = pickPreferredWallet(existing, candidate);
    wallets.delete(existing.id);
    wallets.set(preferred.id, preferred);
    providerIds.set(provider as object, preferred.id);
    return;
  }

  const existingById = wallets.get(candidate.id);
  if (!existingById) {
    wallets.set(candidate.id, candidate);
    providerIds.set(provider as object, candidate.id);
    return;
  }

  const preferred = pickPreferredWallet(existingById, candidate);
  wallets.set(preferred.id, preferred);
  providerIds.set(provider as object, preferred.id);
}

function pickPreferredWallet(current: MinaWalletAdapter, candidate: MinaWalletAdapter): MinaWalletAdapter {
  const currentScore = walletCapabilityScore(current);
  const candidateScore = walletCapabilityScore(candidate);

  if (candidateScore > currentScore) return candidate;
  if (candidateScore < currentScore) return current;

  if (candidate.source === "direct" && current.source !== "direct") return candidate;
  if (current.source === "direct" && candidate.source !== "direct") return current;

  return current;
}

function walletCapabilityScore(wallet: MinaWalletAdapter): number {
  return Object.values(wallet.capabilities).filter(Boolean).length;
}

export async function getWalletById(walletId: string | null | undefined): Promise<MinaWalletAdapter | null> {
  if (!walletId) return null;
  const wallets = await discoverMinaWallets();
  return wallets.find((wallet) => wallet.id === walletId) ?? null;
}

export function summarizeWallet(wallet: MinaWalletAdapter): MinaWalletSummary {
  return {
    id: wallet.id,
    name: wallet.name,
    source: wallet.source,
    capabilities: wallet.capabilities,
  };
}

async function collectAnnouncedProviders(): Promise<MinaAnnouncedProviderDetail[]> {
  const announced: MinaAnnouncedProviderDetail[] = [];
  const seen = new Set<string>();

  const handler = (event: WindowEventMap["mina:announceProvider"]) => {
    const detail = event.detail;
    const provider = detail?.provider;
    if (!provider) return;
    const id = normalizeWalletId(detail.info?.slug ?? detail.info?.name ?? `announced-${announced.length}`);
    if (seen.has(id)) return;
    seen.add(id);
    announced.push(detail);
  };

  window.addEventListener("mina:announceProvider", handler as EventListener);
  window.dispatchEvent(new Event("mina:requestProvider"));
  await delay(150);
  window.removeEventListener("mina:announceProvider", handler as EventListener);

  return announced;
}

function createAdapterFromProvider(params: {
  id: string;
  name: string;
  provider: MinaDirectProvider;
  source: "direct" | "announced";
}): MinaWalletAdapter {
  const provider = params.provider;
  const capabilities = {
    connect: Boolean(provider.requestAccounts || provider.getAccounts || provider.request),
    signMessage: Boolean(provider.signMessage || provider.request),
    requestPresentation: Boolean(provider.requestPresentation || provider.request),
    storeCredential: Boolean(provider.storePrivateCredential || provider.request),
  } satisfies Record<MinaWalletCapability, boolean>;

  return {
    id: params.id,
    name: params.name,
    source: params.source,
    capabilities,
    async requestAccounts() {
      if (provider.requestAccounts) {
        return provider.requestAccounts();
      }

      if (provider.request) {
        for (const method of ["mina_requestAccounts", "mina_accounts", "mina_enable"]) {
          const result = await tryProviderRequest<string[] | { publicKey?: string }>(provider, method);
          const accounts = normalizeAccounts(result);
          if (accounts.length > 0) return accounts;
        }
      }

      throw new Error(`${params.name} does not expose account connection methods.`);
    },
    async getAccounts() {
      if (provider.getAccounts) {
        return provider.getAccounts();
      }

      if (provider.request) {
        const result = await tryProviderRequest<string[] | { publicKey?: string }>(provider, "mina_accounts");
        const accounts = normalizeAccounts(result);
        if (accounts.length > 0) return accounts;
      }

      return this.requestAccounts();
    },
    async signMessage(args) {
      if (provider.signMessage) {
        return provider.signMessage(args);
      }

      if (provider.request) {
        const result = await tryProviderRequest<MinaSignedMessage | MinaProviderError>(provider, "mina_sign", {
          message: args.message,
        });
        if (result) return result;

        const fallback = await tryProviderRequest<MinaSignedMessage | MinaProviderError>(
          provider,
          "mina_signMessage",
          { message: args.message }
        );
        if (fallback) return fallback;
      }

      return {
        code: -1,
        message: `${params.name} does not support message signing for this flow.`,
      };
    },
    async requestPresentation(args) {
      if (provider.requestPresentation) {
        return provider.requestPresentation(args);
      }

      if (provider.request) {
        const result = await tryProviderRequest<MinaPresentationResponse | MinaProviderError>(
          provider,
          "mina_requestPresentation",
          args.presentation
        );
        if (result) return result;
      }

      return {
        code: -1,
        message: `${params.name} does not expose Mina presentation requests yet.`,
      };
    },
    async storePrivateCredential(args) {
      if (provider.storePrivateCredential) {
        return provider.storePrivateCredential(args);
      }

      if (provider.request) {
        return tryProviderRequest(provider, "mina_storePrivateCredential", args);
      }

      throw new Error(`${params.name} does not expose Mina credential storage yet.`);
    },
  };
}

async function tryProviderRequest<T>(
  provider: MinaDirectProvider,
  method: string,
  params?: unknown
): Promise<T | null> {
  if (!provider.request) return null;
  try {
    const response = await provider.request({
      method,
      ...(params === undefined ? {} : { params }),
    });
    return unwrapProviderResponse<T>(response);
  } catch (error) {
    const providerError = error as MinaProviderError | undefined;
    if (shouldRetryWithArrayParams(providerError, params)) {
      try {
        const retryResponse = await provider.request({
          method,
          params: [params],
        });
        return unwrapProviderResponse<T>(retryResponse);
      } catch (retryError) {
        const retryProviderError = retryError as MinaProviderError | undefined;
        if (retryProviderError?.message) {
          return retryProviderError as T;
        }
        return null;
      }
    }
    if (providerError?.message) {
      return providerError as T;
    }
    return null;
  }
}

function unwrapProviderResponse<T>(value: unknown): T {
  if (
    value &&
    typeof value === "object" &&
    "result" in value
  ) {
    return (value as { result: T }).result;
  }
  return value as T;
}

function normalizeAccounts(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (value && typeof value === "object" && "publicKey" in value && typeof value.publicKey === "string") {
    return [value.publicKey];
  }

  return [];
}

function inferWalletName(rawId: string | undefined): string {
  const normalized = normalizeWalletId(rawId ?? "mina");
  return KNOWN_WALLET_NAMES[normalized] ?? titleCase(normalized.replace(/-/g, " "));
}

function normalizeWalletId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
  return WALLET_ID_ALIASES[normalized] ?? normalized;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function shouldRetryWithArrayParams(error: MinaProviderError | undefined, params: unknown): boolean {
  if (params === undefined) return false;
  if (!error?.message) return false;
  const message = error.message.toLowerCase();
  return message.includes("expected array") && message.includes("received object");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
