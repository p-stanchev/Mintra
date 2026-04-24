"use client";

import { mintra } from "@/lib/mintra";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CheckCheck, Clock3, Lock, Shield, Wallet } from "lucide-react";
import { WalletCredentialCard } from "@/components/wallet-credential-card";
import {
  readAuthToken,
  readLinkedWalletAddress,
  readLinkedWalletProviderId,
  readLinkedWalletProviderName,
} from "@/lib/wallet-session";
import { authenticateWallet, resetWalletSession } from "@/lib/wallet-auth";
import { getWalletById } from "@/lib/mina-wallet";
import { useCallback, useEffect, useState } from "react";

type ClaimsResponse = Awaited<ReturnType<typeof mintra.getClaims>>;

function classifyClaimsError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Unable to load claims right now.";
  }

  if (err.message.includes("Mintra API error 401")) {
    return "Reconnect your Mina wallet to refresh your wallet session.";
  }

  if (err.message.includes("Mintra API error 403")) {
    return "This browser session is not authorized for the linked wallet.";
  }

  if (err.message.includes("Failed to fetch")) {
    return "The Mintra API is not reachable right now.";
  }

  return "Unable to load claims right now.";
}

export default function Home() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletProviderId, setWalletProviderId] = useState<string | null>(null);
  const [walletProviderName, setWalletProviderName] = useState<string | null>(null);
  const [claims, setClaims] = useState<ClaimsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [loadingClaims, setLoadingClaims] = useState(true);

  useEffect(() => {
    const syncWallet = () => {
      const linkedWallet = readLinkedWalletAddress();
      setWalletAddress(linkedWallet);
      setWalletProviderId(readLinkedWalletProviderId());
      setWalletProviderName(readLinkedWalletProviderName());

      if (!linkedWallet) {
        setClaims(null);
        setError(null);
        setLoadingClaims(false);
        return;
      }

      if (!readAuthToken()) {
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
        .catch((err: unknown) => {
          setClaims(null);
          const msg = err instanceof Error ? err.message : "";
          if (msg.includes("401")) {
            setSessionExpired(true);
            setError(null);
          } else {
            setSessionExpired(false);
            setError(classifyClaimsError(err));
          }
        })
        .finally(() => {
          setLoadingClaims(false);
        });
    };

    syncWallet();
    window.addEventListener("storage", syncWallet);
    window.addEventListener("mintra:wallet-linked", syncWallet as EventListener);
    window.addEventListener("mintra:auth-updated", syncWallet as EventListener);
    window.addEventListener("mintra:wallet-provider", syncWallet as EventListener);
    window.addEventListener("mintra:wallet-provider-name", syncWallet as EventListener);
    return () => {
      window.removeEventListener("storage", syncWallet);
      window.removeEventListener("mintra:wallet-linked", syncWallet as EventListener);
      window.removeEventListener("mintra:auth-updated", syncWallet as EventListener);
      window.removeEventListener("mintra:wallet-provider", syncWallet as EventListener);
      window.removeEventListener("mintra:wallet-provider-name", syncWallet as EventListener);
    };
  }, []);

  const handleReconnect = useCallback(async () => {
    const provider = await getWalletById(readLinkedWalletProviderId());
    if (!provider) return;
    try {
      setReconnecting(true);
      const accounts = await provider.requestAccounts();
      const address = Array.isArray(accounts) ? accounts[0] : null;
      if (!address) throw new Error("No account returned");
      await authenticateWallet(provider, address);
      setSessionExpired(false);
    } catch (err) {
      await resetWalletSession();
      setError(err instanceof Error ? err.message : "Reconnect failed");
    } finally {
      setReconnecting(false);
    }
  }, []);

  const freshnessStatus = claims?.freshnessStatus ?? "unverified";
  const isFresh = freshnessStatus === "verified" || freshnessStatus === "expiring_soon";
  const isVerified = isFresh && (claims?.claims.age_over_18 === true || claims?.claims.kyc_passed === true);
  const credentialTrust = claims?.credentialTrust;
  const credentialTrustLabel = credentialTrust
    ? credentialTrust.demoCredential
      ? "Demo credential"
      : "Production credential"
    : null;
  const credentialTrustTone = credentialTrust?.demoCredential
    ? "bg-amber-50 text-amber-700"
    : "bg-emerald-50 text-emerald-700";
  const primaryActionLabel = !walletAddress
    ? "Connect wallet first"
    : isVerified
      ? "Open claims"
      : freshnessStatus === "expired"
        ? "Refresh KYC"
        : "Start verification";
  const freshnessTone =
    freshnessStatus === "verified"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : freshnessStatus === "expiring_soon"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : freshnessStatus === "expired"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-line bg-fog text-stone-600";
  const verificationSummary = isVerified
    ? "Credential-ready"
    : freshnessStatus === "expired"
      ? "Refresh required"
      : walletAddress
        ? "Awaiting verification"
        : "Wallet not linked";

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_320px] lg:items-stretch">
        <div className="reveal-up rounded-[28px] border border-line bg-white p-8 shadow-card sm:p-10 lg:p-12">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-line bg-stone-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate">
            <Shield className="h-3.5 w-3.5" />
            Reusable Mina verification
          </div>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-ink sm:text-[3.45rem] sm:leading-[0.98]">
            Verify once. Link your wallet. Reuse the credential anywhere on Mina.
          </h1>

          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-slate">
            Mintra turns a completed identity check into a wallet-bound Mina credential. Verify once, keep the credential in the wallet, and generate fresh verifier-bound proofs for any app that needs them.
          </p>

          <div className="mt-9 grid gap-6 border-t border-line pt-7 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <div className="flex flex-wrap gap-3">
                {walletAddress ? (
                  <Link
                    href={isVerified ? `/claims/${walletAddress}` : "/verify"}
                    className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black"
                  >
                    {primaryActionLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <a
                    href="#wallet-credential"
                    className="inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black"
                  >
                    Connect wallet first
                    <ArrowRight className="h-4 w-4" />
                  </a>
                )}
                <Link
                  href="/protected"
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-stone-50 px-5 py-3 text-sm font-medium text-ink transition hover:bg-white"
                >
                  Protected route
                </Link>
                <Link
                  href="/playground"
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-stone-50 px-5 py-3 text-sm font-medium text-ink transition hover:bg-white"
                >
                  Playground
                </Link>
                <Link
                  href="/relying-party"
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-stone-50 px-5 py-3 text-sm font-medium text-ink transition hover:bg-white"
                >
                  Relying party
                </Link>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <ActionStat
                  label="Wallet session"
                  value={walletAddress ? "Linked" : "Not linked"}
                  detail={walletProviderName ?? "Connect Auro to continue"}
                />
                <ActionStat
                  label="Credential state"
                  value={verificationSummary}
                  detail={
                    freshnessStatus === "verified"
                      ? "Current and ready for proofs"
                      : freshnessStatus === "expiring_soon"
                        ? "Still valid but close to expiry"
                        : freshnessStatus === "expired"
                          ? "Verification must be refreshed"
                          : "No usable credential yet"
                  }
                />
                <ActionStat
                  label="Primary wallet"
                  value={walletProviderName ?? "Not selected"}
                  detail="Auro supports proof + storage in the demo"
                />
              </div>
            </div>

            <div className="rounded-[22px] border border-line bg-stone-50 px-5 py-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Current flow</p>
              <div className="mt-4 space-y-5">
                <HeroStep index="01" title="Link wallet" body="Authenticate a Mina wallet before starting the verification flow." />
                <HeroStep index="02" title="Complete KYC" body="Run the hosted Didit session once and return to Mintra." />
                <HeroStep index="03" title="Issue credential" body="Store the resulting credential in a supported wallet for later proofs." />
              </div>
            </div>
          </div>
        </div>

        <aside className="reveal-up reveal-delay-1 rounded-[28px] border border-line bg-white p-6 shadow-card lg:sticky lg:top-24 lg:h-fit">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Verification rail</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">Current status</h2>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${freshnessTone}`}>
              {freshnessStatus === "verified" ? <BadgeCheck className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {verificationSummary}
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-[20px] border border-line bg-stone-50 px-4">
            <MetricRow
              icon={<Wallet className="h-4 w-4" />}
              label="Wallet"
              value={walletAddress ? "Linked" : "Missing"}
            />
            <MetricRow
              icon={<CheckCheck className="h-4 w-4" />}
              label="KYC"
              value={loadingClaims ? "Loading" : claims?.claims.kyc_passed ? "Approved" : freshnessStatus === "expired" ? "Expired" : "Pending"}
            />
            <MetricRow
              icon={<Shield className="h-4 w-4" />}
              label="Age claim"
              value={loadingClaims ? "Loading" : claims?.claims.age_over_18 ? "18+" : "Unavailable"}
            />
            <MetricRow
              icon={<Clock3 className="h-4 w-4" />}
              label="Freshness"
              value={
                loadingClaims
                  ? "Loading"
                  : freshnessStatus === "verified"
                    ? "Fresh"
                    : freshnessStatus === "expiring_soon"
                      ? "Expiring soon"
                      : freshnessStatus === "expired"
                        ? "Expired"
                      : "Not issued"
              }
            />
          </div>

          <div className="mt-5 rounded-[20px] border border-line bg-stone-50 px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Status marker</p>
            <div className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${freshnessTone}`}>
              {isVerified ? <BadgeCheck className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {freshnessStatus === "verified"
                ? "Verified"
                : freshnessStatus === "expiring_soon"
                  ? "Expiring soon"
                  : freshnessStatus === "expired"
                    ? "Expired — verify again"
                    : "Not verified"}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate">
              {isVerified
                ? "The wallet can issue a credential now. Use the claims view or the issuance panel below."
                : freshnessStatus === "expired"
                  ? "Your previous verification is no longer valid for product use."
                  : walletAddress
                    ? "Wallet is ready. Start or resume the verification flow."
                    : "Connect a wallet first, then start verification."}
            </p>
          </div>

          {claims?.verifiedAt && (
            <div className="mt-5 rounded-[18px] border border-line px-4 py-4 text-sm text-slate">
              <p className="font-medium text-ink">Verification window</p>
              <p className="mt-2">Verified at {new Date(claims.verifiedAt).toLocaleString()}</p>
              {claims.expiresAt && <p className="mt-1">Fresh until {new Date(claims.expiresAt).toLocaleString()}</p>}
              {credentialTrustLabel && (
                <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${credentialTrustTone}`}>
                  <Shield className="h-3.5 w-3.5" />
                  {credentialTrustLabel}
                </div>
              )}
            </div>
          )}
        </aside>
      </section>

      {sessionExpired && (
        <section className="rounded-[20px] border border-amber-200 bg-amber-50 px-6 py-4 text-sm">
          <p className="font-medium text-amber-800 mb-2">Wallet session expired</p>
          <p className="text-amber-700 mb-3">
            Reconnect {walletProviderName ?? "your wallet"} to reload your claims and resume the flow.
          </p>
          <button
            type="button"
            onClick={() => void handleReconnect()}
            disabled={reconnecting}
            className="inline-flex items-center gap-2 rounded-full bg-amber-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-900 disabled:opacity-50"
          >
            {reconnecting ? "Reconnecting…" : `Reconnect ${walletProviderName ?? "wallet"}`}
          </button>
        </section>
      )}

      {error && !sessionExpired && (
        <section className="reveal-up rounded-[20px] border border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-700">
          {error}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <div className="reveal-up reveal-delay-1 rounded-[28px] border border-line bg-white p-8 shadow-card">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Claims and flow</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Operational dashboard</h2>
            </div>
            {walletAddress && (
              <Link href={`/claims/${walletAddress}`} className="text-sm font-medium text-slate transition hover:text-ink">
                Full claim details
              </Link>
            )}
          </div>

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.12fr)_290px]">
            <div className="min-w-0">
              {claims && Object.keys(claims.claims).length > 0 ? (
                <div className="space-y-3">
                  {credentialTrustLabel && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-fog px-4 py-3">
                      <code className="text-sm text-slate">credential_environment</code>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${credentialTrustTone}`}>
                        {credentialTrustLabel}
                      </span>
                    </div>
                  )}
                  {claims.claims.age_over_18 !== undefined && (
                    <ClaimRow label="age_over_18" value={String(claims.claims.age_over_18)} />
                  )}
                  {claims.claims.age_over_21 !== undefined && (
                    <ClaimRow label="age_over_21" value={String(claims.claims.age_over_21)} />
                  )}
                  {claims.claims.kyc_passed !== undefined && (
                    <ClaimRow label="kyc_passed" value={String(claims.claims.kyc_passed)} />
                  )}
                  {claims.claims.country_code !== undefined && (
                    <ClaimRow label="country_code" value={claims.claims.country_code} />
                  )}
                </div>
              ) : (
                <div className="rounded-[22px] border border-dashed border-line bg-stone-50 px-6 py-8">
                  <p className="text-sm text-slate">
                    {walletAddress
                      ? freshnessStatus === "expired"
                        ? "Your stored claim has expired for product use. Start a new verification to refresh it."
                        : "No verified claims yet. Complete the verification flow first."
                      : "Connect a wallet to start verification and load claims."}
                  </p>
                </div>
              )}
            </div>

            <div className="min-w-0 rounded-[22px] border border-line bg-stone-50 px-5 py-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Flow</p>
              <div className="mt-5 space-y-5">
                <StepRow index="01" title="Verify identity" body="Complete the hosted KYC session once to derive normalized claims." />
                <StepRow index="02" title="Link Mina wallet" body="Connect a wallet so the credential binds to the Mina public key." />
                <StepRow index="03" title="Issue credential" body="Store the signed credential in-wallet for later proof requests." />
              </div>
            </div>
          </div>
        </div>

        <div className="reveal-up reveal-delay-2">
          <WalletCredentialCard
            userId={walletAddress ?? ""}
            isVerified={isVerified}
            credentialTrust={claims?.credentialTrust}
          />
        </div>
      </section>
    </div>
  );
}

function ClaimRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-stone-50 px-4 py-3">
      <code className="min-w-0 break-all text-sm text-slate">{label}</code>
      <code className={`text-sm font-medium break-all ${value === "true" ? "text-emerald-700" : "text-ink"}`}>
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
    <div className="flex items-center justify-between border-b border-line py-3 last:border-b-0">
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
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-sm font-medium text-ink shadow-sm">
        {index}
      </div>
      <div>
        <p className="text-base font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate">{body}</p>
      </div>
    </div>
  );
}

function ActionStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[20px] border border-line bg-stone-50 px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">{label}</p>
      <p className="mt-2 text-lg font-medium tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-sm leading-6 text-slate">{detail}</p>
    </div>
  );
}

function HeroStep({
  index,
  title,
  body,
}: {
  index: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-xs font-semibold text-ink shadow-sm">
        {index}
      </div>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate">{body}</p>
      </div>
    </div>
  );
}
