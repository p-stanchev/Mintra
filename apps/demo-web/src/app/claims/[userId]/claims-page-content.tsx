"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { mintra } from "@/lib/mintra";
import { readLinkedWalletAddress } from "@/lib/wallet-session";
import { WalletCredentialCard } from "@/components/wallet-credential-card";

type ClaimsResponse = Awaited<ReturnType<typeof mintra.getClaims>>;

export function ClaimsPageContent({ userId }: { userId: string }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [data, setData] = useState<ClaimsResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const linkedWallet = readLinkedWalletAddress();
    setWalletAddress(linkedWallet);

    if (!linkedWallet || linkedWallet !== userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadClaims() {
      try {
        const result = await mintra.getClaims(userId);
        if (!cancelled) {
          setData(result);
          setFetchError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadClaims();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const ownsRoute = walletAddress === userId;
  const hasClaims = data && Object.keys(data.claims).length > 0;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Claims</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 4 }}>
            Normalized, provider-agnostic claims for{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{userId}</code>
          </p>
        </div>
        <Link href="/" className="btn btn-secondary">
          <ArrowLeft size={16} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} /> Back
        </Link>
      </div>

      {!loading && !ownsRoute && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>
            This claims page is only available to the wallet that completed the verification.
          </p>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Connect the same wallet you used for verification and try again.
          </p>
        </div>
      )}

      {loading && (
        <div className="card">
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Loading claims…</p>
        </div>
      )}

      {ownsRoute && fetchError && (
        <div className="card" style={{ borderColor: "var(--danger)" }}>
          <p style={{ color: "var(--danger)", fontSize: 14 }}>Error: {fetchError}</p>
        </div>
      )}

      {ownsRoute && !loading && !fetchError && !hasClaims && (
        <div className="card">
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 16 }}>
            No verified claims found. Complete a verification first.
          </p>
          <Link href="/verify" className="btn btn-primary" style={{ width: "fit-content" }}>
            Start verification
          </Link>
        </div>
      )}

      {ownsRoute && hasClaims && data && (
        <>
          <div className="card">
            <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Verified Claims</h2>
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
              These claims were derived from your completed KYC verification. Only normalized
              results are shown — no raw identity documents are stored.
            </p>

            <div className="stack" style={{ gap: 8 }}>
              {Object.entries(data.claims).map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                  }}
                >
                  <div>
                    <code style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)" }}>
                      {key}
                    </code>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <code
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 14,
                        color: value === true ? "var(--success)" : "var(--text)",
                        fontWeight: 600,
                      }}
                    >
                      {String(value)}
                    </code>
                    {value === true && <span className="badge badge-success">confirmed</span>}
                  </div>
                </div>
              ))}
            </div>

            {data.verifiedAt && (
              <p style={{ marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
                Verified at: {new Date(data.verifiedAt).toLocaleString()}
              </p>
            )}
          </div>

          <div
            className="card"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
              What these claims mean
            </h2>
            <ul style={{ color: "var(--muted)", fontSize: 13, paddingLeft: 20, lineHeight: 2 }}>
              <li>
                <strong style={{ color: "var(--text)" }}>age_over_18</strong> — the identity
                provider confirmed a government-issued ID with a valid date of birth showing 18+
              </li>
              <li>
                <strong style={{ color: "var(--text)" }}>kyc_passed</strong> — the full KYC check
                (ID + liveness + face match) was approved by the provider
              </li>
              <li>
                <strong style={{ color: "var(--text)" }}>country_code</strong> — ISO 3166-1
                alpha-2 country from the ID document (may be absent if not extracted)
              </li>
            </ul>
            <p style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
              These claims are derived from provider results. Mintra does not store raw documents or
              selfies. See <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>docs/security.md</code>{" "}
              for the full data handling policy.
            </p>
          </div>

          <WalletCredentialCard userId={userId} isVerified={true} />
        </>
      )}
    </div>
  );
}
