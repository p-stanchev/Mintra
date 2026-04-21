"use client";

import { requestPresentationWithHolderBinding } from "@/lib/auro-presentation";
import { extractUiErrorMessage } from "@/lib/errors";
import { mintra } from "@/lib/mintra";
import { readLinkedWalletAddress } from "@/lib/wallet-session";
import { listProofProducts, normalizeVerifierPolicy } from "@mintra/verifier-core";
import type {
  PresentationRequestEnvelope,
  PresentationVerificationResult,
  ProofProductId,
} from "@mintra/sdk-types";
import { AlertTriangle, FlaskConical, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type PlaygroundPolicy = {
  minAge?: 18 | 21 | null;
  requireKycPassed?: boolean;
  countryAllowlist?: string[];
  countryBlocklist?: string[];
  maxCredentialAgeDays?: number;
};

type ClaimsResponse = Awaited<ReturnType<typeof mintra.getClaims>>;

const proofProducts = listProofProducts();

function parseCountryList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function formatPlaygroundError(err: unknown): string {
  const message = extractUiErrorMessage(err, "Could not verify the wallet credential.");
  if (
    message.includes("Program assertion failed") ||
    message.includes("Constraint unsatisfied") ||
    message.includes("Proof verification failed")
  ) {
    return "The stored credential does not satisfy the selected policy. Check the requested age threshold, country allow/block list, freshness window, and holder-binding signature.";
  }
  return message;
}

export default function PlaygroundPage() {
  const [proofProductId, setProofProductId] = useState<ProofProductId>("proof_of_age_18");
  const [minAge, setMinAge] = useState<"18" | "21" | "none">("18");
  const [requireKycPassed, setRequireKycPassed] = useState(true);
  const [countryAllowlist, setCountryAllowlist] = useState("");
  const [countryBlocklist, setCountryBlocklist] = useState("");
  const [maxCredentialAgeDays, setMaxCredentialAgeDays] = useState("30");
  const [loadingStep, setLoadingStep] = useState<"idle" | "requesting" | "proving" | "verifying">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PresentationVerificationResult | null>(null);
  const [requestJson, setRequestJson] = useState<string | null>(null);
  const [claimsData, setClaimsData] = useState<ClaimsResponse | null>(null);

  const loading = loadingStep !== "idle";

  const policy = useMemo<PlaygroundPolicy>(() => {
    const parsedDays = Number(maxCredentialAgeDays);
    return {
      minAge: minAge === "18" ? 18 : minAge === "21" ? 21 : null,
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

  const normalizedPolicy = useMemo(() => normalizeVerifierPolicy(policy), [policy]);

  useEffect(() => {
    const walletAddress = readLinkedWalletAddress();
    if (!walletAddress) {
      setClaimsData(null);
      return;
    }

    let cancelled = false;
    void mintra
      .getClaims(walletAddress)
      .then((data) => {
        if (!cancelled) setClaimsData(data);
      })
      .catch(() => {
        if (!cancelled) setClaimsData(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const likelyBlockers = useMemo(() => {
    if (!claimsData) return [];

    const blockers: string[] = [];
    const claims = claimsData.claims;
    const countryCode = typeof claims.country_code === "string" ? claims.country_code.toUpperCase() : null;

    if (normalizedPolicy.minAge === 18 && claims.age_over_18 !== true) {
      blockers.push("The current claim set does not show `age_over_18 = true`.");
    }
    if (normalizedPolicy.minAge === 21 && claims.age_over_21 !== true) {
      blockers.push("The current claim set does not show `age_over_21 = true`. Reissue a fresh credential after a 21+ verification.");
    }
    if (normalizedPolicy.requireKycPassed && claims.kyc_passed !== true) {
      blockers.push("The current claim set does not show `kyc_passed = true`.");
    }
    if (
      normalizedPolicy.countryAllowlist.length > 0 &&
      countryCode &&
      !normalizedPolicy.countryAllowlist.includes(countryCode)
    ) {
      blockers.push(`The current claim country \`${countryCode}\` is not in the allow list.`);
    }
    if (
      normalizedPolicy.countryBlocklist.length > 0 &&
      countryCode &&
      normalizedPolicy.countryBlocklist.includes(countryCode)
    ) {
      blockers.push(`The current claim country \`${countryCode}\` is in the block list.`);
    }
    if (normalizedPolicy.maxCredentialAgeDays !== null) {
      blockers.push(
        "Freshness is checked against the wallet credential `issuedAt` value during proof verification, so this rule may still fail even if backend claims look fresh."
      );
    }

    return blockers;
  }, [claimsData, normalizedPolicy]);

  async function handleProve() {
    const walletAddress = readLinkedWalletAddress();
    if (!walletAddress) {
      setError("Connect the verified wallet first.");
      setResult(null);
      return;
    }

    const provider = window.mina;
    if (!provider?.requestPresentation || !provider.signMessage) {
      setError("Auro Wallet is required to run the verifier playground.");
      setResult(null);
      return;
    }

    try {
      setError(null);
      setResult(null);
      setLoadingStep("requesting");

      const accounts = provider.getAccounts ? await provider.getAccounts() : await provider.requestAccounts();
      const activeWallet = accounts[0];

      if (!activeWallet) {
        throw new Error("Connect Auro Wallet to continue.");
      }

      if (activeWallet !== walletAddress) {
        throw new Error("Reconnect the same wallet that completed verification.");
      }

      const verifierUrl =
        process.env.NEXT_PUBLIC_MINTRA_VERIFIER_URL?.replace(/\/$/, "") ?? "http://localhost:3002";

      const requestResponse = await fetch(`${verifierUrl}/api/presentation-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proofProductId,
          policy,
        }),
      });

      if (!requestResponse.ok) {
        const body = await requestResponse.text();
        throw new Error(`Could not create proof request: ${body}`);
      }

      const { requestEnvelope }: { requestEnvelope: PresentationRequestEnvelope } =
        await requestResponse.json();

      setRequestJson(JSON.stringify(requestEnvelope, null, 2));
      setLoadingStep("proving");

      const presentationEnvelope = await requestPresentationWithHolderBinding({
        provider,
        requestEnvelope,
        walletAddress: activeWallet,
        verifierUrl,
        walletProviderName: "Auro",
        clientVersion: "demo-web/playground",
      });

      setLoadingStep("verifying");
      const verifyResponse = await fetch(`${verifierUrl}/api/verify-presentation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          presentationEnvelope,
          expectedOwnerPublicKey: activeWallet,
        }),
      });

      const payload = await verifyResponse.json().catch(async () => ({
        error: await verifyResponse.text(),
      }));

      if (!verifyResponse.ok) {
        throw new Error(payload?.error?.message ?? payload?.error ?? "Proof verification failed.");
      }

      setResult(payload as PresentationVerificationResult);
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
          Build a proof product request and test it live against the wallet.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate">
          This page models how a relying party backend would request a Mintra presentation, require
          holder binding, and verify the result off-chain. The verifier issues a single-use challenge,
          Auro builds the proof, then the wallet signs the holder-binding message for that exact proof.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Policy builder</h2>
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink">Proof product</span>
              <select
                value={proofProductId}
                onChange={(event) => setProofProductId(event.target.value as ProofProductId)}
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ink"
              >
                {proofProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.displayName}
                  </option>
                ))}
              </select>
            </label>

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
              {JSON.stringify({ proofProductId, policy }, null, 2)}
            </pre>
          </div>

          {likelyBlockers.length > 0 && (
            <div className="rounded-[32px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Likely blockers
              </div>
              <ul className="list-disc space-y-2 pl-5">
                {likelyBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}

          {requestJson && (
            <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
              <h2 className="text-xl font-semibold tracking-tight text-ink">Issued presentation request</h2>
              <pre className="mt-4 max-h-96 overflow-auto rounded-2xl border border-line bg-fog p-4 text-xs text-ink">
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
