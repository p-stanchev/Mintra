"use client";

import { mintra } from "@/lib/mintra";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readLinkedWalletAddress } from "@/lib/wallet-session";

export default function ProtectedPage() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const walletAddress = readLinkedWalletAddress();
    if (!walletAddress) {
      setLoading(false);
      return;
    }

    mintra
      .getClaims(walletAddress)
      .then((data) => {
        setAllowed(data.claims.age_over_18 === true);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      });
  }, []);

  if (error) {
    return (
      <div className="card" style={{ borderColor: "var(--danger)" }}>
        <p style={{ color: "var(--danger)", fontSize: 14 }}>API error: {error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card">
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Checking wallet claims…</p>
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
            This feature requires the{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>age_over_18</code> claim.
            Complete identity verification to proceed.
          </p>
          <Link href="/verify" className="btn btn-primary">
            Start verification
          </Link>
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
          Your wallet is linked to a verified{" "}
          <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>age_over_18</code> claim.
        </p>
      </div>

      <div className="card" style={{ borderColor: "var(--success)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "var(--success)" }}>
          Access granted
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>
          The protected flow is unlocked. Your verification completed successfully and the linked
          wallet now satisfies the 18+ requirement for this page.
        </p>
      </div>
    </div>
  );
}
