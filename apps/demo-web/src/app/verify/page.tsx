"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
    description: "Document-first KYC flow already integrated in Mintra.",
    available: true,
    badge: "Live",
  },
  {
    id: "idnorm",
    name: "IdNorm",
    description: "Alternative provider flow using IdNorm sessions and webhook updates.",
    available: true,
    badge: "Live",
  },
];

export default function VerifyPage() {
  const [state, setState] = useState<VerifyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [linkedWallet, setLinkedWallet] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

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
    if (!consentChecked) return;
    if (!linkedWallet) {
      setState("blocked");
      setError("Connect your wallet on the home page before starting verification.");
      return;
    }

    try {
      setState("loading");
      setError(null);

      const session = await mintra.startVerification({ userId: linkedWallet, providerId: providerId as "didit" | "idnorm" });
      sessionStorage.setItem("mintra.sessionId", session.sessionId);
      setState("redirecting");
      window.location.href = session.verificationUrl;
    } catch (err: unknown) {
      setState("error");
      setError(extractUiErrorMessage(err, "Unknown error"));
    }
  }

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
              Pick a provider to launch verification. Each provider feeds the same normalized Mintra claim model once approved.
            </p>

            <div
              style={{
                marginBottom: 20,
                border: "1px solid var(--border)",
                borderRadius: 20,
                padding: 16,
                background: "rgba(255,255,255,0.86)",
                textAlign: "left",
              }}
            >
              <p style={{ margin: 0, fontSize: 14, color: "#111111", fontWeight: 600 }}>
                Consent and retention
              </p>
              <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: "var(--muted)" }}>
                By continuing, you consent to the selected KYC provider processing your verification. Mintra keeps only
                minimal normalized verification records needed for credential issuance and proof flows, and retains
                them for the shortest window available in this setup: up to 30 days.
              </p>
              <label
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 13,
                  color: "#111111",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(event) => setConsentChecked(event.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>I understand and consent to this verification and retention policy.</span>
              </label>
            </div>

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
                  disabled={!provider.available || !consentChecked}
                  onClick={() => void handleStartVerification(provider.id)}
                  style={{
                    width: "100%",
                    borderRadius: 20,
                    border: provider.available ? "1px solid var(--border)" : "1px solid #e7e5e4",
                    background: provider.available ? "rgba(255,255,255,0.92)" : "#f5f5f4",
                    opacity: provider.available ? (consentChecked ? 1 : 0.72) : 0.58,
                    padding: "16px 18px",
                    cursor: provider.available && consentChecked ? "pointer" : "not-allowed",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                    boxShadow: provider.available
                      ? "0 1px 2px rgba(17,17,17,0.04), 0 10px 24px rgba(17,17,17,0.05)"
                      : "none",
                  }}
                  aria-disabled={!provider.available || !consentChecked}
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
              Choose the provider that matches the workflow you want to test.
            </p>
            {!consentChecked && (
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
                Confirm consent above to continue.
              </p>
            )}
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
