"use client";

import { WalletCredentialCard } from "@/components/wallet-credential-card";
import { mintra } from "@/lib/mintra";
import {
  readAuthToken,
  readLinkedWalletAddress,
  readLinkedWalletProviderId,
  readLinkedWalletProviderName,
} from "@/lib/wallet-session";
import { authenticateWallet, resetWalletSession } from "@/lib/wallet-auth";
import { getWalletById } from "@/lib/mina-wallet";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CheckCheck,
  ChevronRight,
  Clock3,
  Lock,
  Shield,
  Wallet,
} from "lucide-react";

type ClaimsResponse = Awaited<ReturnType<typeof mintra.getClaims>>;

const claimDescriptions: Record<string, string> = {
  credential_environment: "Marks whether this credential is demo-only or production-ready.",
  age_over_18: "Confirms the holder is at least 18.",
  age_over_21: "Confirms the holder is at least 21.",
  kyc_passed: "Shows that the provider approved the KYC check.",
  country_code: "ISO country code extracted from the identity document.",
};

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
  const [walletProviderName, setWalletProviderName] = useState<string | null>(null);
  const [claims, setClaims] = useState<ClaimsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [loadingClaims, setLoadingClaims] = useState(true);

  useEffect(() => {
    const syncWallet = () => {
      const linkedWallet = readLinkedWalletAddress();
      setWalletAddress(linkedWallet);
      setWalletProviderName(readLinkedWalletProviderName());

      if (!linkedWallet) {
        setClaims(null);
        setError(null);
        setSessionExpired(false);
        setLoadingClaims(false);
        return;
      }

      if (!readAuthToken()) {
        setClaims(null);
        setError(null);
        setSessionExpired(false);
        setLoadingClaims(false);
        return;
      }

      setLoadingClaims(true);
      mintra
        .getClaims(linkedWallet)
        .then((result) => {
          setClaims(result);
          setError(null);
          setSessionExpired(false);
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
      setError(null);
    } catch (err) {
      await resetWalletSession();
      setError(err instanceof Error ? err.message : "Reconnect failed");
    } finally {
      setReconnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    try {
      setDisconnecting(true);
      await resetWalletSession();
      setClaims(null);
      setError(null);
      setSessionExpired(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
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
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";
  const freshnessTone =
    freshnessStatus === "verified"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : freshnessStatus === "expiring_soon"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : freshnessStatus === "expired"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-line bg-fog text-stone-600";

  const verificationSummary = isVerified
    ? "Credential ready"
    : freshnessStatus === "expired"
      ? "Refresh required"
      : walletAddress
        ? "Awaiting verification"
        : "Wallet not linked";

  const primaryAction = !walletAddress
    ? {
        href: "#wallet-credential",
        label: "Connect wallet",
        body: "Start by linking a Mina wallet so the credential can bind to your public key.",
        anchor: true,
      }
    : isVerified
      ? {
          href: "#wallet-credential",
          label: "Issue credential",
          body: "Your claims are ready. Store the credential in-wallet for reuse across Mina apps.",
          anchor: true,
        }
      : freshnessStatus === "expired"
        ? {
            href: "/verify",
            label: "Refresh verification",
            body: "Your previous verification expired for product use. Run the KYC flow again.",
            anchor: false,
          }
        : {
            href: "/verify",
            label: "Start verification",
            body: "Complete the hosted KYC session once, then come back here to issue the credential.",
            anchor: false,
          };

  const secondaryLinks = [
    { href: "/protected", label: "Protected route" },
    { href: "/playground", label: "Playground" },
    { href: "/relying-party", label: "Relying party" },
  ];

  const claimsRows = useMemo(() => {
    const rows: Array<{ key: string; value: string; emphasis?: "success" | "default" }> = [];

    if (credentialTrustLabel) {
      rows.push({ key: "credential_environment", value: credentialTrustLabel });
    }

    if (!claims) {
      return rows;
    }

    if (claims.claims.age_over_18 !== undefined) {
      rows.push({
        key: "age_over_18",
        value: String(claims.claims.age_over_18),
        emphasis: claims.claims.age_over_18 ? "success" : "default",
      });
    }
    if (claims.claims.age_over_21 !== undefined) {
      rows.push({
        key: "age_over_21",
        value: String(claims.claims.age_over_21),
        emphasis: claims.claims.age_over_21 ? "success" : "default",
      });
    }
    if (claims.claims.kyc_passed !== undefined) {
      rows.push({
        key: "kyc_passed",
        value: String(claims.claims.kyc_passed),
        emphasis: claims.claims.kyc_passed ? "success" : "default",
      });
    }
    if (claims.claims.country_code !== undefined) {
      rows.push({ key: "country_code", value: claims.claims.country_code });
    }

    return rows;
  }, [claims, credentialTrustLabel]);

  const statusItems = [
    { icon: <Wallet className="h-4 w-4" />, label: "Wallet", value: walletAddress ? walletProviderName ?? "Linked" : "Not linked" },
    {
      icon: <CheckCheck className="h-4 w-4" />,
      label: "KYC",
      value: loadingClaims ? "Loading" : claims?.claims.kyc_passed ? "Approved" : freshnessStatus === "expired" ? "Expired" : "Pending",
    },
    {
      icon: <Shield className="h-4 w-4" />,
      label: "Credential",
      value: loadingClaims ? "Loading" : verificationSummary,
    },
    {
      icon: <Clock3 className="h-4 w-4" />,
      label: "Freshness",
      value:
        loadingClaims
          ? "Loading"
          : freshnessStatus === "verified"
            ? "Fresh"
            : freshnessStatus === "expiring_soon"
              ? "Expiring soon"
              : freshnessStatus === "expired"
                ? "Expired"
                : "Not issued",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="reveal-up rounded-[36px] border border-line bg-white p-6 shadow-card sm:p-8 lg:p-10">
        <SectionTitle eyebrow="Section 01" title="Reusable Mina verification" />

        <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
          <div className="rounded-[32px] border border-line bg-white p-8 shadow-sm sm:p-10 lg:p-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-stone-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate">
              <Shield className="h-3.5 w-3.5" />
              Reusable Mina verification
            </div>

            <div className="mt-6 border-b border-line pb-8">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-ink sm:text-[3.9rem] sm:leading-[0.94]">
                Verify once. Store the credential. Reuse it across Mina.
              </h1>

              <p className="mt-5 max-w-2xl text-[15px] leading-7 text-slate">
                Mintra turns a completed identity check into a wallet-bound credential that can be presented to any
                verifier on Mina. This page now centers the next action, not the plumbing.
              </p>
            </div>

            <div className="mt-8 grid gap-6 2xl:grid-cols-[minmax(360px,1.18fr)_320px]">
              <div className="min-w-0 space-y-6">
                <div className="rounded-[24px] border border-line bg-fog/80 p-5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Next step</p>
                  <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-[220px] flex-1">
                      <p className="text-2xl font-semibold tracking-tight text-ink">{primaryAction.label}</p>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-slate">{primaryAction.body}</p>
                    </div>
                    {primaryAction.anchor ? (
                      <a
                        href={primaryAction.href}
                        className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black"
                      >
                        {primaryAction.label}
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    ) : (
                      <Link
                        href={primaryAction.href}
                        className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black"
                      >
                        {primaryAction.label}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3">
                  <SurfaceStat
                    label="Wallet"
                    value={walletAddress ? "Linked" : "Missing"}
                    detail={walletProviderName ?? "Connect Auro or Pallad"}
                  />
                  <SurfaceStat
                    label="Credential"
                    value={verificationSummary}
                    detail={
                      freshnessStatus === "verified"
                        ? "Proof-ready and current"
                        : freshnessStatus === "expiring_soon"
                          ? "Still valid, close to expiry"
                          : freshnessStatus === "expired"
                            ? "Must be refreshed"
                            : "No issued credential yet"
                    }
                  />
                  <SurfaceStat
                    label="Storage"
                    value={walletProviderName ?? "No wallet"}
                    detail="Auro supports proof and storage in this demo"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-slate">
                  <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Explore product surfaces</span>
                  {secondaryLinks.map((link) => (
                    <Link key={link.href} href={link.href} className="inline-flex items-center gap-1 transition hover:text-ink">
                      {link.label}
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-line bg-[linear-gradient(180deg,#fafaf9_0%,#f5f5f4_100%)] p-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Flow</p>
                <div className="mt-5 space-y-6">
                  <FlowStep
                    index="01"
                    title="Link wallet"
                    body="Authenticate a Mina wallet first so credential issuance binds to your public key."
                  />
                  <FlowStep
                    index="02"
                    title="Complete verification"
                    body="Run the hosted KYC session once. Mintra normalizes the approved claims."
                  />
                  <FlowStep
                    index="03"
                    title="Store credential"
                    body="Issue the resulting credential into a supported wallet for later proof requests."
                    last
                  />
                </div>
              </div>
            </div>
          </div>

          <aside className="reveal-delay-1 rounded-[32px] border border-line bg-white p-6 shadow-sm xl:sticky xl:top-24 xl:h-fit">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Credential status</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{verificationSummary}</h2>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${freshnessTone}`}>
              {isVerified ? <BadgeCheck className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {freshnessStatus === "verified"
                ? "Verified"
                : freshnessStatus === "expiring_soon"
                  ? "Expiring soon"
                  : freshnessStatus === "expired"
                    ? "Expired"
                    : "Not verified"}
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-slate">
            {isVerified
              ? "The wallet can issue a reusable credential now. Use the issuance panel below to store it."
              : freshnessStatus === "expired"
                ? "Your previous verification remains visible for history, but it is no longer valid for product access."
                : walletAddress
                  ? "The wallet is linked. Complete or resume verification to unlock credential issuance."
                  : "Link a wallet first, then run the verification flow once."}
          </p>

          <div className="mt-6 overflow-hidden rounded-[22px] border border-line bg-stone-50">
            {statusItems.map((item, index) => (
              <StatusItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                value={item.value}
                last={index === statusItems.length - 1}
              />
            ))}
          </div>

          {(claims?.verifiedAt || credentialTrustLabel) && (
            <div className="mt-5 rounded-[22px] border border-line bg-white px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Verification window</p>
              {claims?.verifiedAt && (
                <p className="mt-3 text-sm text-slate">
                  Verified on <span className="font-medium text-ink">{new Date(claims.verifiedAt).toLocaleString()}</span>
                </p>
              )}
              {claims?.expiresAt && (
                <p className="mt-1 text-sm text-slate">
                  Fresh until <span className="font-medium text-ink">{new Date(claims.expiresAt).toLocaleString()}</span>
                </p>
              )}
              {credentialTrustLabel && (
                <div className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${credentialTrustTone}`}>
                  <Shield className="h-3.5 w-3.5" />
                  {credentialTrustLabel}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            {sessionExpired && walletAddress && (
              <button
                type="button"
                onClick={() => void handleReconnect()}
                disabled={reconnecting}
                className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {reconnecting ? "Reconnecting..." : `Reconnect ${walletProviderName ?? "wallet"}`}
              </button>
            )}
            {walletAddress && (
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect wallet"}
              </button>
              )}
          </div>
          </aside>
        </div>
      </section>

      {error && !sessionExpired && (
        <section className="reveal-up rounded-[22px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </section>
      )}

      {sessionExpired && (
        <section className="rounded-[22px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Your wallet session expired. Reconnect {walletProviderName ?? "your wallet"} to reload claims and continue.
        </section>
      )}

      <section className="reveal-up reveal-delay-1 rounded-[36px] border border-line bg-white p-6 shadow-card sm:p-8 lg:p-10">
        <SectionTitle eyebrow="Section 02" title="Credentials" />

        <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
          <div className="rounded-[32px] border border-line bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">Verified claims</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Your credential</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
                  A compact view of the normalized claims that drive product access and proof generation.
                </p>
              </div>
              {walletAddress && (
                <Link href={`/claims/${walletAddress}`} className="text-sm font-medium text-slate transition hover:text-ink">
                  Full claim details
                </Link>
              )}
            </div>

            <div className="mt-8">
              {claimsRows.length > 0 ? (
                <div className="overflow-hidden rounded-[24px] border border-line">
                  <div className="hidden grid-cols-[minmax(0,1.1fr)_140px_minmax(0,1.2fr)] gap-4 border-b border-line bg-fog px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate md:grid">
                    <span>Claim</span>
                    <span>Value</span>
                    <span>Meaning</span>
                  </div>
                  <div className="divide-y divide-line">
                    {claimsRows.map((row) => (
                      <ClaimTableRow
                        key={row.key}
                        label={row.key}
                        value={row.value}
                        description={claimDescriptions[row.key] ?? "Normalized verifier-facing claim."}
                        emphasis={row.emphasis}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-line bg-stone-50 px-6 py-8">
                  <p className="text-sm leading-6 text-slate">
                    {walletAddress
                      ? freshnessStatus === "expired"
                        ? "Your previous verification expired for product use. Start a new verification to refresh the credential."
                        : "No verified claims are available yet. Complete the hosted verification flow first."
                      : "Connect a wallet to begin verification and load credential claims."}
                  </p>
                </div>
              )}
            </div>

            <details className="mt-6 rounded-[22px] border border-line bg-stone-50 px-5 py-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-ink">
                Show technical credential metadata
              </summary>
              <div className="mt-4 space-y-2 text-sm text-slate">
                {claims?.verifiedAt && <p>Verified at: {new Date(claims.verifiedAt).toLocaleString()}</p>}
                {claims?.expiresAt && <p>Fresh until: {new Date(claims.expiresAt).toLocaleString()}</p>}
                {credentialTrust && (
                  <>
                    <p>Issuer: {credentialTrust.issuerDisplayName}</p>
                    <p>Evidence class: {credentialTrust.evidenceClass}</p>
                    <p>Assurance level: {credentialTrust.assuranceLevel}</p>
                  </>
                )}
                {!claims?.verifiedAt && !credentialTrust && <p>No credential metadata is available yet.</p>}
              </div>
            </details>
          </div>

          <div className="reveal-delay-2">
            <WalletCredentialCard userId={walletAddress ?? ""} isVerified={isVerified} credentialTrust={claims?.credentialTrust} />
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="rounded-[28px] border border-line bg-[linear-gradient(180deg,#ffffff_0%,#fafaf9_100%)] px-6 py-8 text-center shadow-sm sm:px-10 sm:py-10">
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate">{eyebrow}</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-5xl sm:leading-none">{title}</h2>
    </div>
  );
}

function SurfaceStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-[20px] border border-line bg-stone-50/70 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[140px] flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate">{label}</p>
          <p className="mt-2 text-lg font-medium tracking-tight text-ink">{value}</p>
        </div>
        <p className="max-w-[220px] text-sm leading-6 text-slate">{detail}</p>
      </div>
    </div>
  );
}

function FlowStep({
  index,
  title,
  body,
  last = false,
}: {
  index: string;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-sm font-semibold text-ink shadow-sm">
          {index}
        </div>
        {!last && <div className="mt-2 h-full min-h-8 w-px bg-line" />}
      </div>
      <div className="pt-1">
        <p className="text-base font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm leading-6 text-slate">{body}</p>
      </div>
    </div>
  );
}

function StatusItem({
  icon,
  label,
  value,
  last = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 ${last ? "" : "border-b border-line"}`}>
      <div className="flex items-center gap-3 text-sm text-slate">
        <span className="text-ink">{icon}</span>
        <span>{label}</span>
      </div>
      <span className="text-right text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

function ClaimTableRow({
  label,
  value,
  description,
  emphasis = "default",
}: {
  label: string;
  value: string;
  description: string;
  emphasis?: "success" | "default";
}) {
  return (
    <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.1fr)_140px_minmax(0,1.2fr)] md:items-center md:gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate md:hidden">Claim</p>
        <code className="block break-all text-sm text-ink">{label}</code>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate md:hidden">Value</p>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
            emphasis === "success" ? "bg-emerald-50 text-emerald-700" : "bg-fog text-ink"
          }`}
        >
          {value}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate md:hidden">Meaning</p>
        <p className="text-sm leading-6 text-slate">{description}</p>
      </div>
    </div>
  );
}
