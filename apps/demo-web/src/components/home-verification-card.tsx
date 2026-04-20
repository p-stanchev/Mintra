"use client";

import { AlertTriangle, BadgeCheck, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { readLinkedWalletAddress } from "@/lib/wallet-session";

type FreshnessStatus = "verified" | "expiring_soon" | "expired" | "unverified";

export function HomeVerificationCard({
  freshnessStatus,
}: {
  freshnessStatus: FreshnessStatus;
}) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setWalletAddress(readLinkedWalletAddress());
    sync();

    window.addEventListener("storage", sync);
    window.addEventListener("mintra:wallet-linked", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("mintra:wallet-linked", sync as EventListener);
    };
  }, []);

  const badgeClass =
    freshnessStatus === "verified"
      ? "bg-emerald-50 text-emerald-700"
      : freshnessStatus === "expiring_soon"
        ? "bg-amber-50 text-amber-700"
        : freshnessStatus === "expired"
          ? "bg-rose-50 text-rose-700"
          : "bg-stone-100 text-stone-600";
  const badgeLabel =
    freshnessStatus === "verified"
      ? "Verified"
      : freshnessStatus === "expiring_soon"
        ? "Expiring soon"
        : freshnessStatus === "expired"
          ? "Expired — verify again"
          : "Awaiting verification";

  return (
    <div className="rounded-[32px] border border-line bg-white p-8 shadow-card sm:p-10">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate">
        <Shield className="h-3.5 w-3.5" />
        Identity verification
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Wallet-first onboarding</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
            Users must link a Mina wallet before starting verification so the resulting credential already has a destination.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}>
          {freshnessStatus === "expiring_soon" || freshnessStatus === "expired" ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <BadgeCheck className="h-3.5 w-3.5" />
          )}
          {badgeLabel}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-fog px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Linked wallet</p>
        <p className="mt-2 text-sm text-ink">
          {walletAddress ?? "No wallet linked yet. Connect Auro below before starting verification."}
        </p>
      </div>

      <p className="mt-6 text-sm leading-6 text-slate">
        {freshnessStatus === "verified"
          ? "Verification is current. Your credential can be issued into Auro below or refreshed any time."
          : freshnessStatus === "expiring_soon"
            ? "Your current KYC is still valid, but it is close to expiring. Refresh it soon."
            : freshnessStatus === "expired"
              ? "Your stored claim has expired for product access. Start a new verification to refresh KYC."
              : walletAddress
                ? "Wallet linked. Scroll back up and start verification."
                : "Connect Auro below first, then come back up to start verification."}
      </p>
    </div>
  );
}
