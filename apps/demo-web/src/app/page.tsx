"use client";

import { mintra } from "@/lib/mintra";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CheckCheck, Lock, Shield, Wallet } from "lucide-react";
import { WalletCredentialCard } from "@/components/wallet-credential-card";
import { HomeVerificationCard } from "@/components/home-verification-card";
import { readLinkedWalletAddress } from "@/lib/wallet-session";
import { useEffect, useState } from "react";

type ClaimsResponse = Awaited<ReturnType<typeof mintra.getClaims>>;

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [claims, setClaims] = useState<ClaimsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingClaims, setLoadingClaims] = useState(true);

  useEffect(() => {
    const syncWallet = () => {
      const linkedWallet = readLinkedWalletAddress();
      setWalletAddress(linkedWallet);

      if (!linkedWallet) {
        setClaims(null);
        setError(null);
        setLoadingClaims(false);
        return;
      }

      setLoadingClaims(true);
      mintra
        .getClaims(linkedWallet)
        .then((result) => {
          setClaims(result);
          setError(null);
        })
        .catch(() => {
          setClaims(null);
          setError("API unavailable");
        })
        .finally(() => {
          setLoadingClaims(false);
        });
    };

    syncWallet();
    window.addEventListener("storage", syncWallet);
    window.addEventListener("mintra:wallet-linked", syncWallet as EventListener);
    window.addEventListener("mintra:auth-updated", syncWallet as EventListener);
    return () => {
      window.removeEventListener("storage", syncWallet);
      window.removeEventListener("mintra:wallet-linked", syncWallet as EventListener);
      window.removeEventListener("mintra:auth-updated", syncWallet as EventListener);
    };
  }, []);

  const isVerified = claims?.claims.age_over_18 === true || claims?.claims.kyc_passed === true;

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[32px] border border-line bg-white p-8 shadow-card sm:p-10">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate">
            <Shield className="h-3.5 w-3.5" />
            Reusable Mina verification
          </div>

          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Verify once. Link your wallet. Reuse the credential anywhere on Mina.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-slate">
            Mintra turns a completed identity check into a wallet-bound Mina credential. The main flow lives here: verify, connect Auro, then issue directly into the wallet.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {walletAddress ? (
              <Link
                href={isVerified ? `/claims/${walletAddress}` : "/verify"}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black"
              >
                {isVerified ? "Open claims" : "Start verification"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <a
                href="#wallet-credential"
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black"
              >
                Connect wallet first
                <ArrowRight className="h-4 w-4" />
              </a>
            )}
            <Link
              href="/protected"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-3 text-sm font-medium text-ink transition hover:bg-fog"
            >
              View protected route
            </Link>
          </div>
        </div>

        <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Verification status</p>
          <p className="mt-3 text-sm text-slate">
            The homepage now drives a single sequence: connect wallet, return to the top, then verify.
          </p>

          <div className={`mt-8 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${isVerified ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>
            {isVerified ? <BadgeCheck className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {isVerified ? "Verified" : "Not verified"}
          </div>

          <div className="mt-8 space-y-4">
            <MetricRow
              icon={<CheckCheck className="h-4 w-4" />}
              label="KYC status"
              value={loadingClaims ? "Loading" : claims?.claims.kyc_passed ? "Approved" : "Waiting"}
            />
            <MetricRow
              icon={<Shield className="h-4 w-4" />}
              label="Age claim"
              value={loadingClaims ? "Loading" : claims?.claims.age_over_18 ? "18+" : "Unavailable"}
            />
            <MetricRow
              icon={<Wallet className="h-4 w-4" />}
              label="Wallet flow"
              value={walletAddress ? "Linked" : "Not linked"}
            />
          </div>

          {claims?.verifiedAt && (
            <p className="mt-8 text-sm text-slate">
              Verified at {new Date(claims.verifiedAt).toLocaleString()}
            </p>
          )}
        </div>
      </section>

      {error && (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">
          API unreachable. Start the API with <code>pnpm --filter @mintra/api dev</code>.
        </section>
      )}

      <HomeVerificationCard isVerified={isVerified} />
      <WalletCredentialCard userId={walletAddress ?? ""} isVerified={isVerified} />

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Flow</p>
          <div className="mt-6 space-y-5">
            <StepRow index="01" title="Verify your identity" body="Complete the hosted KYC session once to derive normalized claims." />
            <StepRow index="02" title="Link Auro Wallet" body="Connect the wallet from the main page so the credential can bind to your Mina public key." />
            <StepRow index="03" title="Issue private credential" body="Mintra signs a Mina credential and stores it in the wallet for later proof requests." />
          </div>
        </div>

        <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Active claims</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Current verification state</h2>
            </div>
            {walletAddress && (
              <Link href={`/claims/${walletAddress}`} className="text-sm font-medium text-slate transition hover:text-ink">
                Full claim details
              </Link>
            )}
          </div>

          {claims && Object.keys(claims.claims).length > 0 ? (
            <div className="space-y-3">
              {claims.claims.age_over_18 !== undefined && (
                <ClaimRow label="age_over_18" value={String(claims.claims.age_over_18)} />
              )}
              {claims.claims.kyc_passed !== undefined && (
                <ClaimRow label="kyc_passed" value={String(claims.claims.kyc_passed)} />
              )}
              {claims.claims.country_code !== undefined && (
                <ClaimRow label="country_code" value={claims.claims.country_code} />
              )}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-line bg-fog px-6 py-8">
              <p className="text-sm text-slate">
                {walletAddress
                  ? "No verified claims yet. Complete the verification flow first."
                  : "Connect a wallet to start verification and load claims."}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ClaimRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-fog px-4 py-3">
      <code className="text-sm text-slate">{label}</code>
      <code className={`text-sm font-medium ${value === "true" ? "text-emerald-700" : "text-ink"}`}>
        {value}
      </code>
    </div>
  );
}

function MetricRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-fog px-4 py-3">
      <div className="flex items-center gap-3 text-sm text-slate">
        <span className="text-ink">{icon}</span>
        <span>{label}</span>
      </div>
      <span className="text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

function StepRow({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-fog text-sm font-medium text-ink">
        {index}
      </div>
      <div>
        <p className="text-base font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate">{body}</p>
      </div>
    </div>
  );
}
