"use client";

import { readLinkedWalletAddress } from "@/lib/wallet-session";
import { AlertTriangle, FlaskConical, Loader2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

type PlaygroundPolicy = {
  minAge?: 18 | 21;
  requireKycPassed?: boolean;
  countryAllowlist?: string[];
  countryBlocklist?: string[];
  maxCredentialAgeDays?: number;
};

type VerificationResult = {
  verified: true;
  ownerPublicKey: string;
  output: {
    ageOver18: boolean;
    ageOver21: boolean;
    kycPassed: boolean;
    countryCodeNumeric: number;
    issuedAt: number;
  };
};

function isProviderError(
  value: { presentation: string } | AuroProviderError
): value is AuroProviderError {
  return "code" in value;
}

function parseCountryList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function formatPlaygroundError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes("Program assertion failed") ||
    message.includes("Constraint unsatisfied") ||
    message.includes("Proof verification failed")
  ) {
    return "The stored credential does not satisfy the selected policy. Check the requested age threshold, country allow/block list, and freshness window.";
  }
  return message;
}

export default function PlaygroundPage() {
  const [minAge, setMinAge] = useState<"18" | "21" | "none">("18");
  const [requireKycPassed, setRequireKycPassed] = useState(true);
  const [countryAllowlist, setCountryAllowlist] = useState("");
  const [countryBlocklist, setCountryBlocklist] = useState("");
  const [maxCredentialAgeDays, setMaxCredentialAgeDays] = useState("30");
  const [loadingStep, setLoadingStep] = useState<"idle" | "requesting" | "proving" | "verifying">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [requestJson, setRequestJson] = useState<string | null>(null);

  const loading = loadingStep !== "idle";

  const policy = useMemo<PlaygroundPolicy>(() => {
    const parsedDays = Number(maxCredentialAgeDays);
    return {
      ...(minAge === "18" ? { minAge: 18 as const } : {}),
      ...(minAge === "21" ? { minAge: 21 as const } : {}),
      requireKycPassed,
      ...(parseCountryList(countryAllowlist).length > 0
        ? { countryAllowlist: parseCountryList(countryAllowlist) }
        : {}),
      ...(parseCountryList(countryBlocklist).length > 0
        ? { countryBlocklist: parseCountryList(countryBlocklist) }
        : {}),
      ...(Number.isFinite(parsedDays) && parsedDays > 0
        ? { maxCredentialAgeDays: parsedDays }
        : {}),
    };
  }, [countryAllowlist, countryBlocklist, maxCredentialAgeDays, minAge, requireKycPassed]);

  async function handleProve() {
    const walletAddress = readLinkedWalletAddress();
    if (!walletAddress) {
      setError("Connect the verified wallet first.");
      setResult(null);
      return;
    }

    const provider = window.mina;
    if (!provider?.requestPresentation) {
      setError("Auro Wallet is required to run the verifier playground.");
      setResult(null);
      return;
    }

    try {
      setError(null);
      setResult(null);
      setLoadingStep("requesting");

      const accounts = provider.getAccounts
        ? await provider.getAccounts()
        : await provider.requestAccounts();
      const activeWallet = accounts[0];

      if (!activeWallet) {
        throw new Error("Connect Auro Wallet to continue.");
      }

      if (activeWallet !== walletAddress) {
        throw new Error("Reconnect the same wallet that completed verification.");
      }

      const verifierUrl =
        process.env.NEXT_PUBLIC_MINTRA_VERIFIER_URL?.replace(/\/$/, "") ??
        "http://localhost:3002";

      const requestResponse = await fetch(`${verifierUrl}/api/presentation-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(policy),
      });

      if (!requestResponse.ok) {
        const body = await requestResponse.text();
        throw new Error(`Could not create proof request: ${body}`);
      }

      const {
        presentationRequest,
        presentationRequestJson,
      }: {
        presentationRequest: unknown;
        presentationRequestJson: string;
      } = await requestResponse.json();

      try {
        setRequestJson(JSON.stringify(JSON.parse(presentationRequestJson), null, 2));
      } catch {
        setRequestJson(presentationRequestJson);
      }
      setLoadingStep("proving");

      const proof = await provider.requestPresentation({
        presentation: {
          presentationRequest,
        },
      });

      if (isProviderError(proof)) {
        if (proof.code === 1001) throw new Error("Reconnect Auro Wallet and try again.");
        if (proof.code === 1002) throw new Error("The proof request was rejected.");
        throw new Error(proof.message || "Auro could not create the presentation.");
      }

      setLoadingStep("verifying");
      const verifyResponse = await fetch(`${verifierUrl}/api/verify-presentation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          presentation: proof.presentation,
          presentationRequestJson,
          expectedOwnerPublicKey: activeWallet,
        }),
      });

      if (!verifyResponse.ok) {
        const body = await verifyResponse.text();
        throw new Error(`Proof verification failed: ${body}`);
      }

      const verified = (await verifyResponse.json()) as VerificationResult;
      setResult(verified);
      setLoadingStep("idle");
    } catch (err) {
      setError(formatPlaygroundError(err));
      setLoadingStep("idle");
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-line bg-white p-8 shadow-card sm:p-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate">
          <FlaskConical className="h-3.5 w-3.5" />
          Verifier Playground
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Build a proof policy and test it live against the wallet.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate">
          This page lets you configure the verifier policy that another Mina app could run on its own backend.
          The verifier service generates the request, Auro builds the proof, and the verifier checks it.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Policy builder</h2>
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink">Minimum age proof</span>
              <select
                value={minAge}
                onChange={(event) => setMinAge(event.target.value as "18" | "21" | "none")}
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ink"
              >
                <option value="18">18+</option>
                <option value="21">21+</option>
                <option value="none">No age rule</option>
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-2xl border border-line bg-fog px-4 py-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={requireKycPassed}
                onChange={(event) => setRequireKycPassed(event.target.checked)}
                className="h-4 w-4 rounded border-line"
              />
              Require <code>kycPassed = 1</code>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink">Country allow list</span>
              <textarea
                rows={3}
                value={countryAllowlist}
                onChange={(event) => setCountryAllowlist(event.target.value)}
                placeholder="US, DE, FR"
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ink"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink">Country block list</span>
              <textarea
                rows={3}
                value={countryBlocklist}
                onChange={(event) => setCountryBlocklist(event.target.value)}
                placeholder="RU, IR"
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ink"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink">Credential freshness window (days)</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={maxCredentialAgeDays}
                onChange={(event) => setMaxCredentialAgeDays(event.target.value)}
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ink"
              />
            </label>

            <button
              type="button"
              onClick={() => void handleProve()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {loading ? "Running verifier flow…" : "Prove with Auro"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Current policy</h2>
            <pre className="mt-4 overflow-x-auto rounded-2xl border border-line bg-fog p-4 text-xs text-ink">
              {JSON.stringify(policy, null, 2)}
            </pre>
          </div>

          {requestJson && (
            <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
              <h2 className="text-xl font-semibold tracking-tight text-ink">Issued presentation request</h2>
              <pre className="mt-4 max-h-72 overflow-auto rounded-2xl border border-line bg-fog p-4 text-xs text-ink">
                {requestJson}
              </pre>
            </div>
          )}

          {error && (
            <div className="rounded-[32px] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Verification failed
              </div>
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-[32px] border border-emerald-200 bg-emerald-50 p-8 shadow-card">
              <h2 className="text-xl font-semibold tracking-tight text-emerald-800">Proof accepted</h2>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-emerald-200 bg-white p-4 text-xs text-ink">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
