"use client";

import { readLinkedWalletAddress } from "@/lib/wallet-session";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function isProviderError(
  value: { presentation: string } | AuroProviderError
): value is AuroProviderError {
  return "code" in value;
}

export default function ProtectedPage() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<"requesting" | "proving" | "verifying">("requesting");
  const [error, setError] = useState<string | null>(null);

  const requestProof = useCallback(async () => {
    const walletAddress = readLinkedWalletAddress();
    if (!walletAddress) {
      setAllowed(false);
      setError("Connect the verified wallet to prove your 18+ credential.");
      setLoading(false);
      return;
    }

    const provider = window.mina;
    if (!provider?.requestPresentation) {
      setAllowed(false);
      setError("Auro Wallet is required to prove the stored credential.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadingStep("requesting");
      setError(null);

      const accounts = provider.getAccounts
        ? await provider.getAccounts()
        : await provider.requestAccounts();
      const activeWallet = accounts[0];

      if (!activeWallet) {
        throw new Error("Connect Auro Wallet to continue.");
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

      const {
        presentationRequest,
        presentationRequestJson,
      }: {
        presentationRequest: unknown;
        presentationRequestJson: string;
      } = await requestResponse.json();

      setLoadingStep("proving");
      const result = await provider.requestPresentation({
        presentation: {
          presentationRequest,
        },
      });

      if (isProviderError(result)) {
        if (result.code === 1001) {
          throw new Error("Reconnect Auro Wallet and try again.");
        }
        if (result.code === 1002) {
          throw new Error("The proof request was rejected.");
        }
        if (result.code === 23001) {
          throw new Error("Auro rejected this origin. Reconnect and try again.");
        }

        throw new Error(result.message || "Auro could not create the presentation.");
      }

      setLoadingStep("verifying");
      const verifyResponse = await fetch(`${verifierUrl}/api/verify-presentation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          presentation: result.presentation,
          presentationRequestJson,
          expectedOwnerPublicKey: activeWallet,
        }),
      });

      if (!verifyResponse.ok) {
        const body = await verifyResponse.text();
        throw new Error(`Proof verification failed: ${body}`);
      }

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
            This page now checks the credential stored in Auro. Prove the wallet-held{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>age_over_18</code> claim to continue.
          </p>
          <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 24 }}>{error}</p>
          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => void requestProof()}>
              Prove with Auro
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
        label: "Sending proof request to Auro…",
        detail: "Check Auro and approve the credential request.",
      },
      proving: {
        label: "Auro is generating the ZK proof…",
        detail: "This takes 30–90 seconds. Auro is computing the proof — don't close the wallet.",
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
            This feature requires an Auro presentation proving the{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>age_over_18</code> claim.
            Complete verification first, then come back and prove it from the wallet.
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <button type="button" className="btn btn-primary" onClick={() => void requestProof()}>
              Prove with Auro
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
          Auro produced a valid presentation for the linked wallet’s{" "}
          <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>age_over_18</code> credential.
        </p>
      </div>

      <div className="card" style={{ borderColor: "var(--success)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "var(--success)" }}>
          Access granted
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>
          The protected flow is unlocked from the wallet proof itself. This page no longer depends
          on the backend claim check to confirm the 18+ requirement.
        </p>
      </div>
    </div>
  );
}
