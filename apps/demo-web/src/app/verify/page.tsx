"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { mintra } from "@/lib/mintra";
import { readLinkedWalletAddress } from "@/lib/wallet-session";

export default function VerifyPage() {
  const [state, setState] = useState<"idle" | "blocked" | "loading" | "redirecting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "idle") return;
    const linkedWallet = readLinkedWalletAddress();
    if (!linkedWallet) {
      setState("blocked");
      setError("Connect your wallet on the home page before starting verification.");
      return;
    }
    setState("loading");

    mintra
      .startVerification({ userId: linkedWallet })
      .then((session) => {
        sessionStorage.setItem("mintra.sessionId", session.sessionId);
        setState("redirecting");
        window.location.href = session.verificationUrl;
      })
      .catch((err: unknown) => {
        setState("error");
        setError(err instanceof Error ? err.message : "Unknown error");
      });
  }, [state]);

  return (
    <div className="stack" style={{ alignItems: "center", paddingTop: 60 }}>
      <div className="card" style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
          {state === "blocked" ? "Wallet required" : "Starting Verification"}
        </h1>

        {(state === "loading" || state === "redirecting") && (
          <>
            <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
              {state === "loading"
                ? "Creating your verification session…"
                : "Redirecting to the identity provider…"}
            </p>
            <Spinner />
          </>
        )}

        {state === "blocked" && (
          <div>
            <p style={{ marginBottom: 16, fontSize: 14, color: "var(--muted)" }}>{error}</p>
            <Link href="/#wallet-credential" className="btn btn-primary">
              Connect wallet on home page
            </Link>
          </div>
        )}

        {state === "error" && (
          <div style={{ color: "var(--danger)" }}>
            <p style={{ marginBottom: 16, fontSize: 14 }}>
              Could not start verification: {error}
            </p>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Make sure the API is running:{" "}
              <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                pnpm --filter @mintra/api dev
              </code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        display: "inline-block",
        width: 32,
        height: 32,
        border: "3px solid var(--border)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}
