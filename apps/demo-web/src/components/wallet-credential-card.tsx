"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, KeyRound, Link as LinkIcon, Loader2, LogOut, ShieldCheck, Wallet } from "lucide-react";
import { mintra } from "@/lib/mintra";
import {
  readAuthToken,
  readLinkedWalletAddress,
  readLinkedWalletProviderId,
  readLinkedWalletProviderName,
} from "@/lib/wallet-session";
import { authenticateWallet, extractErrorMessage, resetWalletSession } from "@/lib/wallet-auth";
import { discoverMinaWallets, getWalletById, summarizeWallet, type MinaWalletSummary } from "@/lib/mina-wallet";
import type { CredentialTrust } from "@mintra/sdk-types";

type WalletState = "idle" | "connecting" | "connected" | "issuing" | "storing" | "done" | "error";

export function WalletCredentialCard({
  userId,
  isVerified,
  credentialTrust,
}: {
  userId: string;
  isVerified: boolean;
  credentialTrust?: CredentialTrust;
}) {
  const [state, setState] = useState<WalletState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletProviderId, setWalletProviderId] = useState<string | null>(null);
  const [walletProviderName, setWalletProviderName] = useState<string | null>(null);
  const [wallets, setWallets] = useState<MinaWalletSummary[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement | null>(null);

  const busy = state === "connecting" || state === "issuing" || state === "storing";
  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) ?? null,
    [selectedWalletId, wallets]
  );
  const actionWallet = selectedWallet ?? wallets.find((wallet) => wallet.id === walletProviderId) ?? null;

  useEffect(() => {
    setMounted(true);
    setWalletAddress(readLinkedWalletAddress());
    setWalletProviderId(readLinkedWalletProviderId());
    setWalletProviderName(readLinkedWalletProviderName());

    let cancelled = false;

    async function loadWallets() {
      const discovered = (await discoverMinaWallets()).map(summarizeWallet);
      if (cancelled) return;
      setWallets((current) => {
        if (
          current.length === discovered.length &&
          current.every(
            (wallet, index) =>
              wallet.id === discovered[index]?.id &&
              wallet.name === discovered[index]?.name
          )
        ) {
          return current;
        }
        return discovered;
      });

      setSelectedWalletId((current) => {
        if (current && discovered.some((wallet) => wallet.id === current)) {
          return current;
        }

        const linkedProviderId = readLinkedWalletProviderId();
        if (linkedProviderId && discovered.some((wallet) => wallet.id === linkedProviderId)) {
          return linkedProviderId;
        }

        return discovered[0]?.id ?? "";
      });
    }

    void loadWallets();
    const refreshInterval = window.setInterval(() => {
      void loadWallets();
    }, 1500);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadWallets();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    const handleStorage = () => {
      setWalletAddress(readLinkedWalletAddress());
      const linkedProviderId = readLinkedWalletProviderId();
      setWalletProviderId(linkedProviderId);
      setWalletProviderName(readLinkedWalletProviderName());
      if (linkedProviderId) {
        setSelectedWalletId(linkedProviderId);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("mintra:wallet-linked", handleStorage as EventListener);
    window.addEventListener("mintra:wallet-provider", handleStorage as EventListener);
    window.addEventListener("mintra:wallet-provider-name", handleStorage as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("mintra:wallet-linked", handleStorage as EventListener);
      window.removeEventListener("mintra:wallet-provider", handleStorage as EventListener);
      window.removeEventListener("mintra:wallet-provider-name", handleStorage as EventListener);
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!walletMenuRef.current) return;
      if (walletMenuRef.current.contains(event.target as Node)) return;
      setWalletMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setWalletMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleConnectWallet() {
    if (!selectedWalletId) {
      setState("error");
      setMessage("No Mina wallet was detected in this browser.");
      return;
    }

    const provider = await getWalletById(selectedWalletId);
    if (!provider) {
      setState("error");
      setMessage("The selected wallet is no longer available. Refresh and try again.");
      return;
    }

    try {
      setState("connecting");
      setMessage(`Connecting ${provider.name}...`);

      const accounts = await provider.requestAccounts();
      const ownerPublicKey = Array.isArray(accounts) ? accounts[0] : null;
      if (!ownerPublicKey) throw new Error("No Mina account returned by the wallet");

      await authenticateWallet(provider, ownerPublicKey);
      setWalletAddress(ownerPublicKey);
      setWalletProviderId(provider.id);
      setWalletProviderName(provider.name);
      setState("connected");
      setMessage(`${provider.name} connected and authenticated.`);
    } catch (err) {
      await resetWalletSession();
      setWalletAddress(null);
      setWalletProviderId(null);
      setWalletProviderName(null);
      setState("error");
      setMessage(extractErrorMessage(err));
    }
  }

  async function handleStoreInWallet() {
    const providerId = selectedWalletId || walletProviderId;
    if (!providerId) {
      setState("error");
      setMessage("No Mina wallet was selected.");
      return;
    }

    const provider = await getWalletById(providerId);
    if (!provider) {
      setState("error");
      setMessage("The selected wallet is no longer available. Refresh and try again.");
      return;
    }

    if (!provider.capabilities.storeCredential) {
      setState("error");
      setMessage(
        `${provider.name} does not expose Mina credential storage yet. Use a wallet with credential storage support for issuance.`
      );
      return;
    }

    try {
      let ownerPublicKey = walletAddress;
      if (!ownerPublicKey) {
        setState("connecting");
        setMessage(`Connecting ${provider.name}...`);
        const accounts = await provider.requestAccounts();
        ownerPublicKey = Array.isArray(accounts) ? accounts[0] : null;
        if (!ownerPublicKey) throw new Error("No Mina account returned by the wallet");
        await authenticateWallet(provider, ownerPublicKey);
        setWalletAddress(ownerPublicKey);
        setWalletProviderId(provider.id);
        setWalletProviderName(provider.name);
      } else if (!readAuthToken()) {
        await authenticateWallet(provider, ownerPublicKey);
        setWalletProviderId(provider.id);
        setWalletProviderName(provider.name);
      }

      const effectiveUserId = userId || ownerPublicKey;
      if (!effectiveUserId) {
        throw new Error("No linked wallet available for credential issuance");
      }

      setState("issuing");
      setMessage("Issuing Mina credential...");
      let issued;
      try {
        issued = await mintra.issueMinaCredential({ userId: effectiveUserId, ownerPublicKey });
      } catch (err) {
        const currentMessage = err instanceof Error ? err.message : "";
        if (/Reauthenticate wallet/i.test(currentMessage)) {
          await authenticateWallet(provider, ownerPublicKey);
          issued = await mintra.issueMinaCredential({ userId: effectiveUserId, ownerPublicKey });
        } else {
          throw err;
        }
      }

      setState("storing");
      setMessage(`Saving credential to ${provider.name}...`);

      let parsedCredential: unknown;
      try {
        parsedCredential = JSON.parse(issued.credentialJson);
      } catch {
        throw new Error("Credential response was not valid JSON");
      }

      await provider.storePrivateCredential({ credential: parsedCredential });

      setState("done");
      setMessage(
        issued.credentialMetadata?.credentialTrust?.demoCredential
          ? `Demo credential saved to ${provider.name}.`
          : `Credential saved to ${provider.name}.`
      );
    } catch (err) {
      if (err instanceof Error && /authentication/i.test(err.message)) {
        await resetWalletSession();
        setWalletAddress(null);
      }
      setState("error");
      setMessage(extractErrorMessage(err));
    }
  }

  async function handleDisconnectWallet() {
    setWalletMenuOpen(false);
    await resetWalletSession();
    setWalletAddress(null);
    setWalletProviderId(null);
    setWalletProviderName(null);
    setState("idle");
    setMessage("Wallet disconnected.");
  }

  const statusLabel = mounted
    ? wallets.length > 0
      ? `${wallets.length} wallet${wallets.length === 1 ? "" : "s"} detected`
      : "No supported wallet found"
    : "Checking wallets";
  const connectButtonLabel =
    actionWallet && actionWallet.id !== walletProviderId
      ? `Connect ${actionWallet.name}`
      : walletAddress
        ? `Reconnect ${walletProviderName ?? "wallet"}`
        : `Connect ${actionWallet?.name ?? "wallet"}`;
  const issueButtonLabel = `Issue to ${actionWallet?.name ?? walletProviderName ?? "wallet"}`;

  return (
    <div id="wallet-credential" className="scroll-mt-28 rounded-[28px] border border-line bg-white p-6 shadow-card sm:p-7">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-line bg-stone-50 px-3 py-1 text-xs font-medium text-slate">
              <Wallet className="h-3.5 w-3.5" />
              Wallet connection
            </div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">Wallet connection</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate">
              Connect Auro or Pallad first. In the current demo, Pallad connection works, but credential storage is only supported through Auro.
            </p>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${mounted && wallets.length > 0 ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
            {mounted && wallets.length > 0 ? <Check className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
            {statusLabel}
          </div>
        </div>

        <div className="block" ref={walletMenuRef}>
          <span className="mb-2 block text-sm font-medium text-ink">Detected wallet</span>
          <button
            type="button"
            onClick={() => setWalletMenuOpen((current) => !current)}
            disabled={!mounted || wallets.length === 0 || busy}
            className="flex w-full items-center justify-between rounded-2xl border border-line bg-stone-50 px-4 py-3 text-left text-sm text-ink outline-none transition hover:bg-white focus:border-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>{selectedWallet?.name ?? "No supported wallet detected"}</span>
            <ChevronDown className={`h-4 w-4 text-slate transition ${walletMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {walletMenuOpen && wallets.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              {wallets.map((wallet) => {
                const active = wallet.id === selectedWalletId;
                return (
                  <button
                    key={wallet.id}
                    type="button"
                    onClick={() => {
                      setSelectedWalletId(wallet.id);
                      setWalletMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition ${
                      active ? "bg-fog text-ink" : "text-slate hover:bg-fog hover:text-ink"
                    }`}
                  >
                    <span>{wallet.name}</span>
                    {active ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedWallet && (
          <div className="rounded-[20px] border border-line bg-stone-50 px-4 py-4 text-sm text-slate">
            <p className="font-medium text-ink">{selectedWallet.name}</p>
            <p className="mt-1 leading-6">
              Proofs: {selectedWallet.capabilities.requestPresentation ? "supported" : "not detected"} · Credential storage: {selectedWallet.capabilities.storeCredential ? "supported" : "not detected"}
            </p>
          </div>
        )}

        {walletAddress && (
          <div className="rounded-[20px] border border-line bg-stone-50 px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Connected address</p>
            <code className="mt-2 block break-all text-sm leading-6 text-ink">
              {walletAddress}
            </code>
            {walletProviderName && (
              <p className="mt-2 text-sm text-slate">Connected through {walletProviderName}</p>
            )}
            {credentialTrust?.demoCredential && (
              <div className="mt-3 inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-amber-700">
                Demo credential source
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => void handleConnectWallet()}
            disabled={!mounted || wallets.length === 0 || busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {state === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            {connectButtonLabel}
          </button>

          <button
            type="button"
            onClick={() => void handleStoreInWallet()}
            disabled={!mounted || wallets.length === 0 || busy || !isVerified}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {state === "issuing" || state === "storing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {state === "issuing"
              ? "Issuing..."
              : state === "storing"
                ? "Storing..."
                : issueButtonLabel}
          </button>

          {walletAddress && (
            <button
              type="button"
              onClick={() => void handleDisconnectWallet()}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          )}
        </div>

        {message && (
          <p className={`text-sm ${state === "error" ? "text-rose-600" : state === "done" ? "text-emerald-700" : "text-slate"}`}>
            {message}
          </p>
        )}

        {!isVerified && (
          <p className="text-sm text-slate">
            Verification must be completed before wallet issuance is enabled.
          </p>
        )}

        {credentialTrust?.demoCredential && (
          <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            The current claim set is marked as a demo credential. It can be issued into a wallet for testing, but
            production verifiers should reject it unless demo credentials are explicitly allowed.
          </div>
        )}

        <div className="grid gap-2.5 text-xs text-slate md:grid-cols-2 2xl:grid-cols-3">
          <div className="rounded-[18px] border border-line bg-stone-50 px-4 py-3">
            <p className="font-medium text-ink">1. Link wallet</p>
            <p className="mt-1 leading-5">Connect Auro or Pallad. Pallad is currently connection-only in this demo.</p>
          </div>
          <div className="rounded-[18px] border border-line bg-stone-50 px-4 py-3">
            <p className="font-medium text-ink">2. Verify</p>
            <p className="mt-1 leading-5">Scroll back up and complete the hosted identity check.</p>
          </div>
          <div className="rounded-[18px] border border-line bg-stone-50 px-4 py-3">
            <p className="font-medium text-ink">3. Store credential</p>
            <p className="mt-1 leading-5">Save the private credential into a wallet that exposes Mina credential storage.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
