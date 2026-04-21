"use client";

import { requestPresentationWithHolderBinding } from "@/lib/auro-presentation";
import {
  readLinkedWalletAddress,
  readLinkedWalletProviderId,
  readLinkedWalletProviderName,
} from "@/lib/wallet-session";
import { getWalletById } from "@/lib/mina-wallet";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  PresentationRequestEnvelope,
  PresentationVerificationResult,
} from "@mintra/sdk-types";

export default function ProtectedPage() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<"requesting" | "proving" | "verifying">("requesting");
  const [error, setError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<PresentationVerificationResult | null>(null);
  const [walletProviderName, setWalletProviderName] = useState<string | null>(null);

  const requestProof = useCallback(async () => {
    const walletAddress = readLinkedWalletAddress();
    const providerName = readLinkedWalletProviderName();
    setWalletProviderName(providerName);

    if (!walletAddress) {
      setAllowed(false);
      setError("Connect the verified wallet to prove your 18+ credential.");
      setLoading(false);
      return;
    }

    const provider = await getWalletById(readLinkedWalletProviderId());
    if (!provider?.capabilities.requestPresentation) {
      setAllowed(false);
      setError(`${providerName ?? "This wallet"} does not support Mina proof presentation in this flow.`);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadingStep("requesting");
      setError(null);

      const accounts = await provider.getAccounts();
      const activeWallet = accounts[0];

      if (!activeWallet) {
        throw new Error(`Connect ${provider.name} to continue.`);
      }

      if (activeWallet !== walletAddress) {
        throw new Error("Reconnect the same wallet that completed verification.");
      }

      const verifierUrl =
        process.env.NEXT_PUBLIC_MINTRA_VERIFIER_URL?.replace(/\/$/, "") ??
        "http://localhost:3002";

      const requestResponse = await fetch(`${verifierUrl}/api/presentation-request`, {
        method: "GET",
      });

      if (!requestResponse.ok) {
        const body = await requestResponse.text();
        throw new Error(`Could not create proof request: ${body}`);
      }

      const { requestEnvelope }: { requestEnvelope: PresentationRequestEnvelope } =
        await requestResponse.json();

      setLoadingStep("proving");
      const presentationEnvelope = await requestPresentationWithHolderBinding({
        provider,
        requestEnvelope,
        walletAddress: activeWallet,
        verifierUrl,
        walletProviderName: provider.name,
        clientVersion: "demo-web/protected",
      });

      setLoadingStep("verifying");
      const verifyResponse = await fetch(`${verifierUrl}/api/verify-presentation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          presentationEnvelope,
          expectedOwnerPublicKey: activeWallet,
        }),
      });

      if (!verifyResponse.ok) {
        const body = await verifyResponse.json().catch(async () => ({
          error: await verifyResponse.text(),
        }));
        throw new Error(body?.error?.message ?? body?.error ?? "Proof verification failed.");
      }

      const result = (await verifyResponse.json()) as PresentationVerificationResult;
      setVerificationResult(result);
      setAllowed(true);
      setLoading(false);
    } catch (err) {
      setAllowed(false);
      setError(err instanceof Error ? err.message : "Could not verify the wallet credential.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void requestProof();
  }, [requestProof]);

  if (error) {
    return (
      <div className="stack" style={{ alignItems: "center", paddingTop: 60 }}>
        <div className="card" style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <Lock size={36} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Access Denied</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 12 }}>
            This page now checks the credential stored in a Mina wallet. Prove the wallet-held{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>age_over_18</code> claim to continue.
          </p>
          <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 24 }}>{error}</p>
          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => void requestProof()}>
              Prove with {walletProviderName ?? "wallet"}
            </button>
            <Link href="/verify" className="btn btn-secondary">
              Start verification
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    const steps: Record<typeof loadingStep, { label: string; detail: string }> = {
      requesting: {
        label: `Sending proof request to ${walletProviderName ?? "wallet"}…`,
        detail: "Check the wallet and approve the credential request.",
      },
      proving: {
        label: `${walletProviderName ?? "Wallet"} is generating the ZK proof…`,
        detail: "This takes 30–90 seconds. The wallet is computing the proof — don't close it.",
      },
      verifying: {
        label: "Verifying proof on server…",
        detail: "Almost done.",
      },
    };
    const { label, detail } = steps[loadingStep];
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>{label}</p>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>{detail}</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="stack" style={{ alignItems: "center", paddingTop: 60 }}>
        <div className="card" style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <Lock size={36} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Access Denied</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
            This feature requires a Mina wallet presentation proving the{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>age_over_18</code> claim.
            Complete verification first, then come back and prove it from the wallet.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => void requestProof()}>
              Prove with {walletProviderName ?? "wallet"}
            </button>
            <Link href="/verify" className="btn btn-secondary">
              Start verification
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="badge badge-success">Verified Access</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Verification successful</h1>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>
          {walletProviderName ?? "Your wallet"} produced a valid presentation for the linked wallet’s{" "}
          <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>age_over_18</code> credential.
        </p>
      </div>

      <div className="card" style={{ borderColor: "var(--success)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "var(--success)" }}>
          Access granted
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>
          The protected flow is unlocked from the wallet proof itself. The verifier checked the
          Mina presentation, verified audience binding, and confirmed the wallet signed the
          holder-binding challenge for this exact proof.
        </p>
        {verificationResult?.challenge && (
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
            Challenge{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
              {verificationResult.challenge.challengeId}
            </code>{" "}
            verified for{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
              {verificationResult.ownerPublicKey}
            </code>
            .
          </p>
        )}
      </div>
    </div>
  );
}
