"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound, Link as LinkIcon, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { mintra } from "@/lib/mintra";
import { readAuthToken, readLinkedWalletAddress } from "@/lib/wallet-session";
import { authenticateWallet, resetWalletSession } from "@/lib/wallet-auth";

type WalletState = "idle" | "connecting" | "connected" | "issuing" | "storing" | "done" | "error";

function getWalletProvider() {
  if (typeof window === "undefined") return null;
  return window.mina ?? null;
}

export function WalletCredentialCard({ userId, isVerified }: { userId: string; isVerified: boolean }) {
  const [state, setState] = useState<WalletState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletInstalled, setWalletInstalled] = useState(false);
  const [mounted, setMounted] = useState(false);

  const busy = state === "connecting" || state === "issuing" || state === "storing";

  useEffect(() => {
    setMounted(true);
    setWalletInstalled(Boolean(getWalletProvider()));
    setWalletAddress(readLinkedWalletAddress());
  }, []);

  async function handleConnectWallet() {
    const provider = getWalletProvider();
    if (!provider) {
      setState("error");
      setMessage("Auro Wallet was not detected in this browser.");
      return;
    }

    try {
      setState("connecting");
      setMessage("Connecting wallet...");

      const accounts = await provider.requestAccounts();
      const ownerPublicKey = Array.isArray(accounts) ? accounts[0] : null;
      if (!ownerPublicKey) throw new Error("No Mina account returned by the wallet");

      await authenticateWallet(provider, ownerPublicKey);
      setWalletAddress(ownerPublicKey);
      setState("connected");
      setMessage("Wallet connected and authenticated.");
    } catch (err) {
      resetWalletSession();
      setWalletAddress(null);
      setState("error");
      setMessage(err instanceof Error ? err.message : "Wallet connection failed");
    }
  }

  async function handleStoreInWallet() {
    const provider = getWalletProvider();
    if (!provider) {
      setState("error");
      setMessage("Auro Wallet was not detected in this browser.");
      return;
    }

    try {
      let ownerPublicKey = walletAddress;
      if (!ownerPublicKey) {
        setState("connecting");
        setMessage("Connecting wallet...");
        const accounts = await provider.requestAccounts();
        ownerPublicKey = Array.isArray(accounts) ? accounts[0] : null;
        if (!ownerPublicKey) throw new Error("No Mina account returned by the wallet");
        await authenticateWallet(provider, ownerPublicKey);
        setWalletAddress(ownerPublicKey);
      } else if (!readAuthToken()) {
        await authenticateWallet(provider, ownerPublicKey);
      }

      const effectiveUserId = userId || ownerPublicKey;
      if (!effectiveUserId) {
        throw new Error("No linked wallet available for credential issuance");
      }

      setState("issuing");
      setMessage("Issuing Mina credential...");
      const issued = await mintra.issueMinaCredential({ userId: effectiveUserId, ownerPublicKey });

      setState("storing");
      setMessage("Saving credential to Auro...");

      let parsedCredential: unknown;
      try {
        parsedCredential = JSON.parse(issued.credentialJson);
      } catch {
        throw new Error("Credential response was not valid JSON");
      }

      await provider.storePrivateCredential({ credential: parsedCredential });

      setState("done");
      setMessage("Credential saved to Auro Wallet.");
    } catch (err) {
      if (err instanceof Error && /authentication/i.test(err.message)) {
        resetWalletSession();
        setWalletAddress(null);
      }
      setState("error");
      setMessage(err instanceof Error ? err.message : "Wallet flow failed");
    }
  }

  return (
    <div id="wallet-credential" className="rounded-3xl border border-line bg-white p-6 shadow-card">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium text-slate">
              <Wallet className="h-3.5 w-3.5" />
              Wallet credential
            </div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">Link Auro wallet</h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate">
              Connect your Mina wallet first. After verification is approved, you can issue the credential into Auro from this same card.
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${mounted && walletInstalled ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
            {mounted && walletInstalled ? <Check className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
            {mounted ? (walletInstalled ? "Auro detected" : "Auro not found") : "Checking wallet"}
          </div>
        </div>

        {walletAddress && (
          <div className="rounded-2xl border border-line bg-fog px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Connected address</p>
            <code className="mt-2 block overflow-hidden text-ellipsis whitespace-nowrap text-sm text-ink">
              {walletAddress}
            </code>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleConnectWallet}
            disabled={!mounted || !walletInstalled || busy}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-fog disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            {walletAddress ? "Reconnect Auro" : "Connect Auro"}
          </button>

          <button
            type="button"
            onClick={handleStoreInWallet}
            disabled={!mounted || !walletInstalled || busy || !isVerified}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "issuing" || state === "storing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {state === "issuing" ? "Issuing..." : state === "storing" ? "Storing..." : "Issue to Auro"}
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
            <p className="mt-1 leading-6">Connect Auro so the later credential has a destination.</p>
          </div>
          <div className="rounded-2xl border border-line bg-fog px-4 py-3">
            <p className="font-medium text-ink">2. Verify</p>
            <p className="mt-1 leading-6">Scroll back up and complete the hosted identity check.</p>
          </div>
          <div className="rounded-2xl border border-line bg-fog px-4 py-3">
            <p className="font-medium text-ink">3. Store credential</p>
            <p className="mt-1 leading-6">Save the private credential into Auro for later proof flows.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
