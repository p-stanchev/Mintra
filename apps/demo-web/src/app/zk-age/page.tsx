"use client";

import { mintra } from "@/lib/mintra";
import {
  readLinkedWalletAddress,
  readLinkedWalletProviderName,
} from "@/lib/wallet-session";
import type {
  GetZkAgeProofInputResponse,
  ZkVerificationResult,
} from "@mintra/sdk-types";
import { ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

type Step = "idle" | "loading-input" | "requesting-policy" | "proving" | "verifying";

export default function ZkAgePage() {
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ZkVerificationResult | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(readLinkedWalletAddress());
  const [walletProviderName, setWalletProviderName] = useState<string | null>(readLinkedWalletProviderName());
  const [proofInput, setProofInput] = useState<GetZkAgeProofInputResponse | null>(null);

  async function handleRun() {
    const linkedWallet = readLinkedWalletAddress();
    const providerName = readLinkedWalletProviderName();
    setWalletAddress(linkedWallet);
    setWalletProviderName(providerName);

    if (!linkedWallet) {
      setMessage("Connect and authenticate the verified wallet first.");
      setResult(null);
      return;
    }

    const verifierUrl =
      process.env.NEXT_PUBLIC_MINTRA_VERIFIER_URL?.replace(/\/$/, "") ??
      "http://localhost:3002";

    try {
      setMessage(null);
      setResult(null);

      setStep("loading-input");
      const zkInput = await mintra.getZkAgeProofInput(linkedWallet);
      setProofInput(zkInput);

      setStep("requesting-policy");
      const policyResponse = await fetch(`${verifierUrl}/api/zk/policy-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          minAge: 18,
        }),
      });

      const policyBody = await policyResponse.json().catch(async () => ({
        error: await policyResponse.text(),
      }));
      if (!policyResponse.ok) {
        throw new Error(policyBody?.error ?? "Could not create zk policy request.");
      }

      setStep("proving");
      const { proveAgeClaimFromCredentialMetadata } = await import("@mintra/zk-claims");
      const proof = await proveAgeClaimFromCredentialMetadata({
        credentialMetadata: zkInput.credentialMetadata,
        dateOfBirth: zkInput.dateOfBirth,
        minAge: policyBody.requirements.ageGte,
        referenceDate: policyBody.publicInputs.referenceDate,
      });

      setStep("verifying");
      const verifyResponse = await fetch(`${verifierUrl}/api/zk/verify-age-proof`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request: policyBody,
          proof: proof.toJSON(),
        }),
      });

      const verifyBody = await verifyResponse.json().catch(async () => ({
        error: await verifyResponse.text(),
      }));
      if (!verifyResponse.ok) {
        throw new Error(
          verifyBody?.error?.message ??
            verifyBody?.error?.detail ??
            verifyBody?.error ??
            "Could not verify zk proof."
        );
      }

      setResult(verifyBody as ZkVerificationResult);
      setStep("idle");
    } catch (error) {
      setStep("idle");
      setMessage(error instanceof Error ? error.message : "Could not run zk age proof flow.");
    }
  }

  const stepLabel: Record<Exclude<Step, "idle">, string> = {
    "loading-input": "Loading credential-bound proof input…",
    "requesting-policy": "Requesting verifier zk policy…",
    proving: "Generating age proof in the browser…",
    verifying: "Verifying proof with the verifier service…",
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-line bg-white p-8 shadow-card sm:p-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate">
          <Sparkles className="h-3.5 w-3.5" />
          Credential-Bound ZK Age
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Prove age from Mintra-issued credential metadata.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate">
          This route demonstrates the new off-chain zk path: Mintra returns a wallet-authenticated
          prover payload, the browser generates an age proof from <code>credentialMetadata.version = "v2"</code>,
          and the verifier checks the resulting <code>mintra.zk.age-threshold/v1</code> proof.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Run the flow</h2>
          <div className="mt-6 rounded-2xl border border-line bg-fog px-4 py-4 text-sm text-slate">
            <div className="font-medium text-ink">Authenticated wallet</div>
            <div className="mt-2 break-all font-mono text-xs text-ink">
              {walletAddress ?? "No authenticated wallet session"}
            </div>
            <div className="mt-3 text-xs text-slate">
              {walletProviderName
                ? `Wallet provider: ${walletProviderName}`
                : "The zk browser flow uses the wallet-authenticated API session, not direct wallet proving."}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={step !== "idle"}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
          >
            <ShieldCheck className={`h-4 w-4 ${step !== "idle" ? "animate-pulse" : ""}`} />
            {step === "idle" ? "Generate credential-bound age proof" : stepLabel[step]}
          </button>

          {proofInput && (
            <div className="mt-6 rounded-2xl border border-line bg-white px-4 py-4 text-sm text-slate">
              <div className="mb-2 font-medium text-ink">Loaded prover input</div>
              <pre className="overflow-x-auto text-xs text-ink">
                {JSON.stringify(
                  {
                    userId: proofInput.userId,
                    dateOfBirth: proofInput.dateOfBirth,
                    sourceCommitments: proofInput.credentialMetadata.version === "v2"
                      ? proofInput.credentialMetadata.sourceCommitments
                      : {},
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>

        <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Verifier result</h2>
          {!message && !result && (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-fog px-5 py-8 text-sm text-slate">
              Run the credential-bound zk flow to see the verifier outcome.
            </div>
          )}

          {message && (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
              {message}
            </div>
          )}

          {result && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" />
                Proof accepted
              </div>
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
