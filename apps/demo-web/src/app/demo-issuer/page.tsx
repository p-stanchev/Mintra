"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlaskConical, ShieldAlert, Sparkles } from "lucide-react";
import { mintra } from "@/lib/mintra";
import { readAuthToken, readLinkedWalletAddress } from "@/lib/wallet-session";

type DemoClaimsResponse = Awaited<ReturnType<typeof mintra.issueDemoClaims>>;

export default function DemoIssuerPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [hasAuthToken, setHasAuthToken] = useState(false);
  const [ageOver18, setAgeOver18] = useState(true);
  const [ageOver21, setAgeOver21] = useState(false);
  const [kycPassed, setKycPassed] = useState(true);
  const [countryCode, setCountryCode] = useState("BG");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoClaimsResponse | null>(null);

  useEffect(() => {
    const sync = () => {
      setWalletAddress(readLinkedWalletAddress());
      setHasAuthToken(Boolean(readAuthToken()));
    };

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("mintra:wallet-linked", sync as EventListener);
    window.addEventListener("mintra:auth-updated", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("mintra:wallet-linked", sync as EventListener);
      window.removeEventListener("mintra:auth-updated", sync as EventListener);
    };
  }, []);

  async function handleSubmit() {
    if (!walletAddress) {
      setError("Connect and authenticate a Mina wallet first.");
      return;
    }

    if (ageOver21 && !ageOver18) {
      setError("Age 21+ requires age 18+.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const response = await mintra.issueDemoClaims({
        userId: walletAddress,
        ageOver18,
        ageOver21,
        kycPassed,
        countryCode: countryCode.trim().toUpperCase() || undefined,
      });
      setResult(response);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Failed to issue demo claims.");
    } finally {
      setSubmitting(false);
    }
  }

  function applyPreset(preset: "adult" | "twentyOne" | "kycOnly") {
    if (preset === "adult") {
      setAgeOver18(true);
      setAgeOver21(false);
      setKycPassed(true);
      return;
    }

    if (preset === "twentyOne") {
      setAgeOver18(true);
      setAgeOver21(true);
      setKycPassed(true);
      return;
    }

    setAgeOver18(false);
    setAgeOver21(false);
    setKycPassed(true);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-line bg-white/90 p-8 shadow-card backdrop-blur-sm sm:p-10">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate">
          <FlaskConical className="h-3.5 w-3.5" />
          Demo credential issuer
        </div>

        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Create synthetic demo claims without Didit.
        </h1>

        <p className="mt-5 max-w-3xl text-base leading-7 text-slate">
          This page creates synthetic demo claims for the currently authenticated wallet. It bypasses Didit completely,
          writes local demo claim state, and marks the resulting credential as demo-only.
        </p>

        <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Didit-based verification is production verification. This page is only for testing issuance,
              presentations, verifier policy handling, and UX without running real KYC.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-line bg-white/90 p-8 shadow-card backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Wallet session</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Configure demo claims</h2>
            </div>
            <div
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                walletAddress && hasAuthToken ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"
              }`}
            >
              {walletAddress && hasAuthToken ? "Ready" : "Connect first"}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-fog px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Authenticated wallet</p>
            <p className="mt-2 break-all text-sm text-ink">
              {walletAddress ?? "No wallet linked yet. Connect and authenticate a wallet from the home page first."}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => applyPreset("adult")}
              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-fog"
            >
              Adult verified
            </button>
            <button
              type="button"
              onClick={() => applyPreset("twentyOne")}
              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-fog"
            >
              21+ verified
            </button>
            <button
              type="button"
              onClick={() => applyPreset("kycOnly")}
              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-fog"
            >
              KYC-only
            </button>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <label className="rounded-2xl border border-line bg-fog px-4 py-4 text-sm text-ink">
              <div className="flex items-center justify-between gap-3">
                <span>Age over 18</span>
                <input
                  type="checkbox"
                  checked={ageOver18}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setAgeOver18(checked);
                    if (!checked) setAgeOver21(false);
                  }}
                />
              </div>
            </label>

            <label className="rounded-2xl border border-line bg-fog px-4 py-4 text-sm text-ink">
              <div className="flex items-center justify-between gap-3">
                <span>Age over 21</span>
                <input
                  type="checkbox"
                  checked={ageOver21}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setAgeOver21(checked);
                    if (checked) setAgeOver18(true);
                  }}
                />
              </div>
            </label>

            <label className="rounded-2xl border border-line bg-fog px-4 py-4 text-sm text-ink">
              <div className="flex items-center justify-between gap-3">
                <span>KYC passed</span>
                <input
                  type="checkbox"
                  checked={kycPassed}
                  onChange={(event) => setKycPassed(event.target.checked)}
                />
              </div>
            </label>

            <label className="rounded-2xl border border-line bg-fog px-4 py-4 text-sm text-ink">
              <span className="block text-xs font-medium uppercase tracking-[0.18em] text-slate">Country code</span>
              <input
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value.toUpperCase().slice(0, 2))}
                placeholder="BG"
                className="mt-3 w-full border-0 bg-transparent p-0 text-sm text-ink outline-none"
              />
            </label>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!walletAddress || !hasAuthToken || submitting}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {submitting ? "Creating demo claims..." : "Create demo claims"}
            </button>
            <Link
              href="/#wallet-credential"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-3 text-sm font-medium text-ink transition hover:bg-fog"
            >
              Go to wallet issuance
            </Link>
          </div>
        </div>

        <div className="rounded-[32px] border border-line bg-white/90 p-8 shadow-card backdrop-blur-sm">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate">Result</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Stored demo claim</h2>

          {result ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-line bg-fog px-4 py-4">
                <p className="text-sm font-medium text-ink">Demo claims saved for {result.userId}</p>
                <p className="mt-2 text-sm text-slate">
                  Verified at {result.verifiedAt ? new Date(result.verifiedAt).toLocaleString() : "now"}
                </p>
              </div>

              <div className="space-y-3">
                {Object.entries(result.claims).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-2xl border border-line bg-fog px-4 py-3">
                    <code className="text-sm text-slate">{key}</code>
                    <code className="text-sm font-medium text-ink">{String(value)}</code>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                This path creates demo credentials only. Production verifiers should reject them unless demo credentials
                are explicitly allowed.
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/claims/${result.userId}`}
                  className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-fog"
                >
                  Open claims page
                </Link>
                <Link
                  href="/#wallet-credential"
                  className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-fog"
                >
                  Issue into wallet
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-fog px-5 py-8 text-sm leading-6 text-slate">
              No demo claims issued yet. Create synthetic claim state on the left, then issue the resulting credential
              into a wallet from the home page.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
