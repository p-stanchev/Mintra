"use client";

import { BadgeCheck, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { readLinkedWalletAddress } from "@/lib/wallet-session";

export function HomeVerificationCard({ isVerified }: { isVerified: boolean }) {
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
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${isVerified ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>
          <BadgeCheck className="h-3.5 w-3.5" />
          {isVerified ? "Verified" : "Awaiting verification"}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-fog px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Linked wallet</p>
        <p className="mt-2 text-sm text-ink">
          {walletAddress ?? "No wallet linked yet. Connect Auro below before starting verification."}
        </p>
      </div>

      <p className="mt-6 text-sm leading-6 text-slate">
        {isVerified
          ? "Verification is complete. Your credential can now be issued into Auro below."
          : walletAddress
            ? "Wallet linked. Scroll back up and start verification."
            : "Connect Auro below first, then come back up to start verification."}
      </p>
    </div>
  );
}
