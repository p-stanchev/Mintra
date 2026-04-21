"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Building2, Lock } from "lucide-react";
import { mintra } from "@/lib/mintra";
import { readLinkedWalletAddress } from "@/lib/wallet-session";
import { extractUiErrorMessage } from "@/lib/errors";

type VerifyState = "idle" | "blocked" | "choosing" | "loading" | "redirecting" | "error";

type ProviderOption = {
  id: string;
  name: string;
  description: string;
  available: boolean;
  badge?: string;
};

const PROVIDERS: ProviderOption[] = [
  {
    id: "didit",
    name: "Didit",
    description: "Active provider in the current demo flow.",
    available: true,
    badge: "Live",
  },
  {
    id: "persona",
    name: "Persona",
    description: "Planned provider integration.",
    available: false,
  },
  {
    id: "sumsub",
    name: "Sumsub",
    description: "Planned provider integration.",
    available: false,
  },
  {
    id: "veriff",
    name: "Veriff",
    description: "Planned provider integration.",
    available: false,
  },
];

export default function VerifyPage() {
  const [state, setState] = useState<VerifyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [linkedWallet, setLinkedWallet] = useState<string | null>(null);

  useEffect(() => {
    const wallet = readLinkedWalletAddress();
    setLinkedWallet(wallet);

    if (!wallet) {
      setState("blocked");
      setError("Connect your wallet on the home page before starting verification.");
      return;
    }

    setState("choosing");
  }, []);

  async function handleStartVerification(providerId: string) {
    if (providerId !== "didit") return;
    if (!linkedWallet) {
      setState("blocked");
      setError("Connect your wallet on the home page before starting verification.");
      return;
    }

    try {
      setState("loading");
      setError(null);

      const session = await mintra.startVerification({ userId: linkedWallet });
      sessionStorage.setItem("mintra.sessionId", session.sessionId);
      setState("redirecting");
      window.location.href = session.verificationUrl;
    } catch (err: unknown) {
      setState("error");
      setError(extractUiErrorMessage(err, "Unknown error"));
    }
  }

  const activeProvider = useMemo(
    () => PROVIDERS.find((provider) => provider.available) ?? PROVIDERS[0],
    []
  );

  return (
    <div className="stack" style={{ alignItems: "center", paddingTop: 60 }}>
      <div className="card" style={{ maxWidth: 560, width: "100%", textAlign: "center", position: "relative" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
          {state === "blocked"
            ? "Wallet required"
            : state === "choosing"
              ? "Choose verification provider"
              : "Starting Verification"}
        </h1>

        {state === "choosing" && (
          <>
            <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
              Pick a provider to launch verification. Only Didit is enabled in the current demo.
            </p>

            <div
              style={{
                display: "grid",
                gap: 12,
                textAlign: "left",
                marginBottom: 20,
              }}
            >
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  disabled={!provider.available}
                  onClick={() => void handleStartVerification(provider.id)}
                  style={{
                    width: "100%",
                    borderRadius: 20,
                    border: provider.available ? "1px solid var(--border)" : "1px solid #e7e5e4",
                    background: provider.available ? "rgba(255,255,255,0.92)" : "#f5f5f4",
                    opacity: provider.available ? 1 : 0.58,
                    padding: "16px 18px",
                    cursor: provider.available ? "pointer" : "not-allowed",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                    boxShadow: provider.available
                      ? "0 1px 2px rgba(17,17,17,0.04), 0 10px 24px rgba(17,17,17,0.05)"
                      : "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 38,
                          height: 38,
                          borderRadius: 9999,
                          background: provider.available ? "#111111" : "#e7e5e4",
                          color: provider.available ? "#ffffff" : "#78716c",
                        }}
                      >
                        <Building2 size={18} />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 16, fontWeight: 600, color: "#111111" }}>{provider.name}</span>
                          {provider.badge ? (
                            <span className="badge badge-success">
                              <BadgeCheck size={12} />
                              {provider.badge}
                            </span>
                          ) : (
                            <span className="badge badge-muted">
                              <Lock size={12} />
                              Soon
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>{provider.description}</p>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Selected flow will continue with{" "}
              <strong style={{ color: "#111111" }}>{activeProvider.name}</strong>.
            </p>
          </>
        )}

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
            <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" onClick={() => setState("choosing")}>
                Choose provider again
              </button>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, alignSelf: "center" }}>
                Make sure the API is running:{" "}
                <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  pnpm --filter @mintra/api dev
                </code>
              </p>
            </div>
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
