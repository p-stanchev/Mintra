"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { mintra } from "@/lib/mintra";
import type { VerificationStatus } from "@mintra/sdk-types";
import Link from "next/link";
import { Suspense } from "react";
import { readLinkedWalletAddress } from "@/lib/wallet-session";

function CallbackInner() {
  const params = useSearchParams();
  const sessionId =
    params.get("verificationSessionId") ??
    params.get("sessionId") ??
    params.get("session_id") ??
    "";

  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);

  const poll = useCallback(async () => {
    if (!sessionId) {
      setError("No session ID in URL");
      return;
    }
    try {
      const result = await mintra.getVerificationStatus(sessionId);
      setStatus(result.status);
      setUserId(result.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [sessionId]);

  useEffect(() => {
    poll();
    const terminal = ["approved", "rejected", "error"];
    if (status && terminal.includes(status)) return;
    const timer = setInterval(() => {
      setPolls((p) => p + 1);
      poll();
    }, 3000);
    return () => clearInterval(timer);
  }, [poll, status]);

  useEffect(() => {
    if (!userId) {
      setUserId(readLinkedWalletAddress());
    }
  }, [userId]);

  const statusConfig = {
    approved: { label: "Verified", color: "var(--success)", next: true },
    rejected: { label: "Rejected", color: "var(--danger)", next: false },
    needs_review: { label: "In review", color: "var(--warn)", next: false },
    pending: { label: "Processing…", color: "var(--accent)", next: false },
    not_started: { label: "Waiting…", color: "var(--muted)", next: false },
    error: { label: "Error", color: "var(--danger)", next: false },
  };

  const cfg = status ? (statusConfig[status] ?? statusConfig.pending) : null;

  return (
    <div className="stack" style={{ alignItems: "center", paddingTop: 60 }}>
      <div className="card" style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
          Verification Status
        </h1>

        {error && <p style={{ color: "var(--danger)", fontSize: 14 }}>{error}</p>}

        {!error && !status && (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Checking status…</p>
        )}

        {cfg && (
          <>
            <p style={{ color: cfg.color, fontSize: 20, fontWeight: 700, margin: "20px 0" }}>
              {cfg.label}
            </p>
            {cfg.next ? (
              <div className="stack" style={{ gap: 12, alignItems: "center" }}>
                <p style={{ color: "var(--muted)", fontSize: 14 }}>
                  Your identity has been verified. Claims are now available.
                </p>
                <Link href={userId ? `/claims/${userId}` : "/"} className="btn btn-primary">
                  View my claims
                </Link>
              </div>
            ) : status !== "rejected" && status !== "error" ? (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>
                Checked {polls + 1} time{polls !== 0 ? "s" : ""} — still waiting…
              </p>
            ) : (
              <div className="stack" style={{ alignItems: "center" }}>
                <p style={{ color: "var(--muted)", fontSize: 14 }}>
                  The verification was not approved. Please try again.
                </p>
                <Link href="/verify" className="btn btn-secondary">
                  Try again
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>Loading…</div>}>
      <CallbackInner />
    </Suspense>
  );
}
