"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, KeyRound, Link as LinkIcon, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { mintra } from "@/lib/mintra";
import {
  readAuthToken,
  readLinkedWalletAddress,
  readLinkedWalletProviderId,
  readLinkedWalletProviderName,
} from "@/lib/wallet-session";
import { authenticateWallet, extractErrorMessage, resetWalletSession } from "@/lib/wallet-auth";
import { discoverMinaWallets, getWalletById, summarizeWallet, type MinaWalletSummary } from "@/lib/mina-wallet";

type WalletState = "idle" | "connecting" | "connected" | "issuing" | "storing" | "done" | "error";

export function WalletCredentialCard({ userId, isVerified }: { userId: string; isVerified: boolean }) {
  const [state, setState] = useState<WalletState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletProviderId, setWalletProviderId] = useState<string | null>(null);
  const [walletProviderName, setWalletProviderName] = useState<string | null>(null);
  const [wallets, setWallets] = useState<MinaWalletSummary[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  const busy = state === "connecting" || state === "issuing" || state === "storing";
  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) ?? null,
    [selectedWalletId, wallets]
  );

  useEffect(() => {
    setMounted(true);
    setWalletAddress(readLinkedWalletAddress());
    setWalletProviderId(readLinkedWalletProviderId());
    setWalletProviderName(readLinkedWalletProviderName());

    let cancelled = false;

    async function loadWallets() {
      const discovered = (await discoverMinaWallets()).map(summarizeWallet);
      if (cancelled) return;
      setWallets(discovered);

      const linkedProviderId = readLinkedWalletProviderId();
      const nextSelection =
        (linkedProviderId && discovered.some((wallet) => wallet.id === linkedProviderId)
          ? linkedProviderId
          : discovered[0]?.id) ?? "";
      setSelectedWalletId(nextSelection);
    }

    void loadWallets();

    const handleStorage = () => {
      setWalletAddress(readLinkedWalletAddress());
      setWalletProviderId(readLinkedWalletProviderId());
      setWalletProviderName(readLinkedWalletProviderName());
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("mintra:wallet-linked", handleStorage as EventListener);
    window.addEventListener("mintra:wallet-provider", handleStorage as EventListener);
    window.addEventListener("mintra:wallet-provider-name", handleStorage as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("mintra:wallet-linked", handleStorage as EventListener);
      window.removeEventListener("mintra:wallet-provider", handleStorage as EventListener);
      window.removeEventListener("mintra:wallet-provider-name", handleStorage as EventListener);
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
    const providerId = walletProviderId ?? selectedWalletId;
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
      setMessage(`Credential saved to ${provider.name}.`);
    } catch (err) {
      if (err instanceof Error && /authentication/i.test(err.message)) {
        await resetWalletSession();
        setWalletAddress(null);
      }
      setState("error");
      setMessage(extractErrorMessage(err));
    }
  }

  const statusLabel = mounted
    ? wallets.length > 0
      ? `${wallets.length} wallet${wallets.length === 1 ? "" : "s"} detected`
      : "No supported wallet found"
    : "Checking wallets";

  return (
    <div id="wallet-credential" className="scroll-mt-28 rounded-3xl border border-line bg-white p-6 shadow-card">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium text-slate">
              <Wallet className="h-3.5 w-3.5" />
              Wallet credential
            </div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">Link a Mina wallet</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate">
              Connect Auro, Pallad, or a Clorio-compatible Mina wallet first. After verification is approved, you can issue the credential into a wallet that supports Mina credential storage.
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${mounted && wallets.length > 0 ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
            {mounted && wallets.length > 0 ? <Check className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
            {statusLabel}
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink">Detected wallet</span>
          <select
            value={selectedWalletId}
            onChange={(event) => setSelectedWalletId(event.target.value)}
            disabled={!mounted || wallets.length === 0 || busy}
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {wallets.length === 0 ? (
              <option value="">No supported wallet detected</option>
            ) : (
              wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))
            )}
          </select>
        </label>

        {selectedWallet && (
          <div className="rounded-2xl border border-line bg-fog px-4 py-3 text-sm text-slate">
            <p className="font-medium text-ink">{selectedWallet.name}</p>
            <p className="mt-1">
              Proofs: {selectedWallet.capabilities.requestPresentation ? "supported" : "not detected"} · Credential storage: {selectedWallet.capabilities.storeCredential ? "supported" : "not detected"}
            </p>
          </div>
        )}

        {walletAddress && (
          <div className="rounded-2xl border border-line bg-fog px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Connected address</p>
            <code className="mt-2 block overflow-hidden text-ellipsis whitespace-nowrap text-sm text-ink">
              {walletAddress}
            </code>
            {walletProviderName && (
              <p className="mt-2 text-sm text-slate">Connected through {walletProviderName}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleConnectWallet()}
            disabled={!mounted || wallets.length === 0 || busy}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-fog disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            {walletAddress ? `Reconnect ${walletProviderName ?? "wallet"}` : "Connect wallet"}
          </button>

          <button
            type="button"
            onClick={() => void handleStoreInWallet()}
            disabled={!mounted || wallets.length === 0 || busy || !isVerified}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
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
                : `Issue to ${walletProviderName ?? selectedWallet?.name ?? "wallet"}`}
          </button>
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

        <div className="grid gap-3 text-sm text-slate sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-fog px-4 py-3">
            <p className="font-medium text-ink">1. Link wallet</p>
            <p className="mt-1 leading-6">Connect Auro, Pallad, or Clorio-compatible Mina wallet so the later credential has a destination.</p>
          </div>
          <div className="rounded-2xl border border-line bg-fog px-4 py-3">
            <p className="font-medium text-ink">2. Verify</p>
            <p className="mt-1 leading-6">Scroll back up and complete the hosted identity check.</p>
          </div>
          <div className="rounded-2xl border border-line bg-fog px-4 py-3">
            <p className="font-medium text-ink">3. Store credential</p>
            <p className="mt-1 leading-6">Save the private credential into a wallet that exposes Mina credential storage.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
