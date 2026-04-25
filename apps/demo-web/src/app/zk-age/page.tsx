"use client";

import { mintra } from "@/lib/mintra";
import {
  readLinkedWalletAddress,
  readLinkedWalletProviderName,
  readStoredZkProofMaterial,
} from "@/lib/wallet-session";
import type {
  GetZkProofInputResponse,
  ZkPolicyRequest,
  ZkVerificationResult,
} from "@mintra/sdk-types";
import { ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type Step = "idle" | "loading-input" | "requesting-policy" | "proving" | "verifying";
type ProofMode = "age18" | "age21" | "kyc" | "country";
type RegistryState =
  | {
      address: string;
      nonce: string;
      permissionsEditState: string;
      zkappState: string[];
    }
  | null;
let proofRuntimePromise: Promise<void> | undefined;

export default function ZkAgePage() {
  const [step, setStep] = useState<Step>("idle");
  const [proofMode, setProofMode] = useState<ProofMode>("age18");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ZkVerificationResult | null>(null);
  const [isCrossOriginIsolated, setIsCrossOriginIsolated] = useState<boolean | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletProviderName, setWalletProviderName] = useState<string | null>(null);
  const [proofInput, setProofInput] = useState<GetZkProofInputResponse | null>(null);
  const [countryAllowlist, setCountryAllowlist] = useState("BG, DE");
  const [countryBlocklist, setCountryBlocklist] = useState("");
  const [registryState, setRegistryState] = useState<RegistryState>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);

  useEffect(() => {
    const syncWallet = () => {
      setWalletAddress(readLinkedWalletAddress());
      setWalletProviderName(readLinkedWalletProviderName());
      setIsCrossOriginIsolated(window.crossOriginIsolated);
    };

    syncWallet();
    window.addEventListener("storage", syncWallet);
    window.addEventListener("mintra:wallet-linked", syncWallet as EventListener);
    window.addEventListener("mintra:wallet-provider-name", syncWallet as EventListener);
    return () => {
      window.removeEventListener("storage", syncWallet);
      window.removeEventListener("mintra:wallet-linked", syncWallet as EventListener);
      window.removeEventListener("mintra:wallet-provider-name", syncWallet as EventListener);
    };
  }, []);

  useEffect(() => {
    const registryAddress = process.env.NEXT_PUBLIC_MINTRA_ZKAPP_REGISTRY_ADDRESS;
    const graphqlUrl = process.env.NEXT_PUBLIC_MINA_GRAPHQL_URL;

    if (!registryAddress || !graphqlUrl) {
      setRegistryState(null);
      setRegistryError(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(graphqlUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query:
              "query($pk: PublicKey!) { account(publicKey: $pk) { publicKey nonce zkappState permissions { editState } } }",
            variables: {
              pk: registryAddress,
            },
          }),
        });

        const payload = (await response.json()) as {
          data?: {
            account?: {
              publicKey: string;
              nonce: string;
              zkappState: string[];
              permissions?: {
                editState?: string;
              };
            } | null;
          };
          errors?: Array<{ message?: string }>;
        };

        if (!response.ok || payload.errors?.length) {
          throw new Error(payload.errors?.[0]?.message ?? `GraphQL request failed with ${response.status}`);
        }

        if (!cancelled) {
          if (!payload.data?.account) {
            setRegistryState(null);
            setRegistryError("Registry account was not found on the configured network.");
            return;
          }

          setRegistryState({
            address: payload.data.account.publicKey,
            nonce: payload.data.account.nonce,
            permissionsEditState: payload.data.account.permissions?.editState ?? "Unknown",
            zkappState: payload.data.account.zkappState,
          });
          setRegistryError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRegistryState(null);
          setRegistryError(error instanceof Error ? error.message : "Could not load registry state.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
      const zkInput =
        readStoredZkProofMaterial(linkedWallet) ?? (await mintra.getZkProofInput(linkedWallet));
      setProofInput(zkInput);

      setStep("requesting-policy");
      const policyRequestBody =
        proofMode === "age18"
          ? { proofType: "mintra.zk.age-threshold/v1", minAge: 18 as const }
          : proofMode === "age21"
            ? { proofType: "mintra.zk.age-threshold/v1", minAge: 21 as const }
            : proofMode === "kyc"
              ? { proofType: "mintra.zk.kyc-passed/v1" as const }
              : {
                  proofType: "mintra.zk.country-membership/v1" as const,
                  countryAllowlist: parseCountryList(countryAllowlist),
                  countryBlocklist: parseCountryList(countryBlocklist),
                };

      const policyResponse = await fetch(`${verifierUrl}/api/zk/policy-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(policyRequestBody),
      });

      const policyBody = await policyResponse.json().catch(async () => ({
        error: await policyResponse.text(),
      }));
      if (!policyResponse.ok) {
        throw new Error(policyBody?.error ?? "Could not create zk policy request.");
      }
      const zkRequest = policyBody as ZkPolicyRequest;

      setStep("proving");
      const proof = await createProofForRequest(zkInput, zkRequest);

      setStep("verifying");
      const verifyResponse = await fetch(`${verifierUrl}/api/zk/verify-proof`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request: zkRequest,
          proof,
        }),
      });

      const verifyBody = await verifyResponse.json().catch(async () => ({
        error: await verifyResponse.text(),
      }));
      if (!verifyResponse.ok) {
        throw new Error(extractZkErrorMessage(verifyBody, "Could not verify zk proof."));
      }

      const verificationResult = verifyBody as ZkVerificationResult;
      setResult(verificationResult);
      if (!verificationResult.ok) {
        setMessage(
          extractZkErrorMessage(
            verificationResult,
            "Proof was rejected by the verifier."
          )
        );
        setStep("idle");
        return;
      }

      setStep("idle");
    } catch (error) {
      setStep("idle");
      setMessage(error instanceof Error ? error.message : "Could not run zk proof flow.");
    }
  }

  const stepLabel: Record<Exclude<Step, "idle">, string> = {
    "loading-input": "Loading credential-bound proof input…",
    "requesting-policy": "Requesting verifier zk policy…",
    proving: "Generating proof in the browser…",
    verifying: "Verifying proof with the verifier service…",
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:rounded-[32px] sm:p-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate">
          <Sparkles className="h-3.5 w-3.5" />
          Dynamic ZK Proofs
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Configure verifier-bound proofs from Mintra-issued credential metadata.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate">
          This route demonstrates the off-chain zk verifier layer as a configurable product surface.
          The browser loads wallet-authenticated prover input, requests a typed verifier policy,
          generates the matching proof from <code>credentialMetadata.version = "v2"</code>, and
          submits it back to the verifier.
        </p>
        <div className="mt-4 rounded-2xl border border-line bg-fog px-4 py-3 text-sm text-slate">
          Proof runtime:{" "}
          <span className="font-medium text-ink">
            {isCrossOriginIsolated === null ? "checking browser runtime" : "server-side by default"}
          </span>
          . The demo now prefers backend proving to avoid mobile freezes. Browser-side o1js proving only runs as a fallback if the API endpoint is unavailable{isCrossOriginIsolated === false ? " and this session is not cross-origin isolated." : "."}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Run the flow</h2>
          <div className="mt-6 rounded-2xl border border-line bg-fog px-4 py-4 text-sm text-slate">
            <div className="font-medium text-ink">Authenticated wallet</div>
            <div className="mt-2 break-all font-mono text-xs leading-6 text-ink">
              {walletAddress ?? "No authenticated wallet session"}
            </div>
            <div className="mt-3 text-xs text-slate">
              {walletProviderName
                ? `Wallet provider: ${walletProviderName}`
                : "The zk browser flow uses the wallet-authenticated API session, not direct wallet proving."}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              { id: "age18", label: "Age 18+" },
              { id: "age21", label: "Age 21+" },
              { id: "kyc", label: "KYC passed" },
              { id: "country", label: "Country policy" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setProofMode(option.id as ProofMode)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  proofMode === option.id
                    ? "border-ink bg-fog text-ink"
                    : "border-line bg-white text-slate hover:bg-fog"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {proofMode === "country" && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate">
                <span className="mb-2 block font-medium text-ink">Allowlist</span>
                <input
                  value={countryAllowlist}
                  onChange={(event) => setCountryAllowlist(event.target.value)}
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ink"
                  placeholder="BG, DE"
                />
              </label>
              <label className="text-sm text-slate">
                <span className="mb-2 block font-medium text-ink">Blocklist</span>
                <input
                  value={countryBlocklist}
                  onChange={(event) => setCountryBlocklist(event.target.value)}
                  className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ink"
                  placeholder="US"
                />
              </label>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={step !== "idle"}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50 sm:w-auto"
          >
            <ShieldCheck className={`h-4 w-4 ${step !== "idle" ? "animate-pulse" : ""}`} />
            {step === "idle" ? "Generate credential-bound zk proof" : stepLabel[step]}
          </button>

          {proofInput && (
            <div className="mt-6 rounded-2xl border border-line bg-white px-4 py-4 text-sm text-slate">
              <div className="mb-2 font-medium text-ink">Loaded prover input</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-6 text-ink">
                {JSON.stringify(
                  {
                    userId: proofInput.userId,
                    dateOfBirth: proofInput.dateOfBirth,
                    kycPassed: proofInput.kycPassed,
                    countryCode: proofInput.countryCode,
                    countryCodeNumeric: proofInput.countryCodeNumeric,
                    sourceCommitments:
                      proofInput.credentialMetadata.version === "v2"
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

        <div className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Verifier result</h2>
          {!message && !result && (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-fog px-5 py-8 text-sm text-slate">
              Run a configured credential-bound zk flow to see the verifier outcome.
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
              <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl border border-emerald-200 bg-white p-4 text-[11px] leading-6 text-ink">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-white p-5 shadow-card sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-ink">On-chain registry</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
          Mintra now exposes a shared on-chain registry for trust anchors. Site-specific policy still stays off-chain,
          but this page can read the registry account and show the currently anchored proof verification key hashes.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-line bg-fog px-4 py-4 text-sm text-slate">
            <div className="font-medium text-ink">Configured registry</div>
            <div className="mt-2 break-all font-mono text-xs leading-6 text-ink">
              {process.env.NEXT_PUBLIC_MINTRA_ZKAPP_REGISTRY_ADDRESS ?? "Registry env var not set"}
            </div>
            <div className="mt-3 break-all text-xs leading-5 text-slate">
              GraphQL: {process.env.NEXT_PUBLIC_MINA_GRAPHQL_URL ?? "Not configured"}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white px-4 py-4 text-sm text-slate">
            {!registryState && !registryError && (
              <div>No registry data loaded yet. Set both public env vars to read the deployed account.</div>
            )}
            {registryError && <div className="text-rose-700">{registryError}</div>}
            {registryState && (
              <dl className="space-y-3 text-xs leading-6 text-ink">
                <RegistryRow label="Address" value={registryState.address} />
                <RegistryRow label="Nonce" value={registryState.nonce} />
                <RegistryRow label="Edit state" value={registryState.permissionsEditState} />
                <RegistryRow
                  label="Issuer key fields"
                  value={registryState.zkappState.slice(0, 2).join(", ")}
                />
                <RegistryRow label="Age VK hash" value={registryState.zkappState[2]} />
                <RegistryRow label="KYC VK hash" value={registryState.zkappState[3]} />
                <RegistryRow label="Country VK hash" value={registryState.zkappState[4]} />
                <RegistryRow label="Credential root" value={registryState.zkappState[5]} />
                <RegistryRow label="Revocation root" value={registryState.zkappState[6]} />
              </dl>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function parseCountryList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

function RegistryRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="rounded-xl border border-line bg-fog px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate">{label}</dt>
      <dd className="mt-1 break-all text-ink">{value ?? "Unavailable"}</dd>
    </div>
  );
}

function extractZkErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const maybePayload = payload as {
    error?: {
      message?: string;
      detail?: string;
    } | string;
    message?: string;
  };

  if (typeof maybePayload.error === "string" && maybePayload.error.trim()) {
    return maybePayload.error;
  }

  if (typeof maybePayload.error === "object" && maybePayload.error !== null) {
    if (typeof maybePayload.error.detail === "string" && maybePayload.error.detail.trim()) {
      return maybePayload.error.detail;
    }
    if (typeof maybePayload.error.message === "string" && maybePayload.error.message.trim()) {
      return maybePayload.error.message;
    }
  }

  if (typeof maybePayload.message === "string" && maybePayload.message.trim()) {
    return maybePayload.message;
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return fallback;
  }
}

async function createProofForRequest(
  zkInput: GetZkProofInputResponse,
  request: ZkPolicyRequest
) {
  try {
    const response = await mintra.createZkProof({
      userId: zkInput.userId,
      request,
    });
    return response.proof;
  } catch (error) {
    if (!shouldFallbackToBrowserProving(error)) {
      throw error;
    }
  }

  if (!window.crossOriginIsolated) {
    throw new Error(
      "Server-side proving is unavailable and this browser session is not cross-origin isolated for local proving."
    );
  }

  const proof = await createBrowserProofForRequest(zkInput, request);
  return proof.toJSON();
}

async function createBrowserProofForRequest(
  zkInput: GetZkProofInputResponse,
  request: ZkPolicyRequest
) {
  await ensureProofRuntime();

  if (request.proofType === "mintra.zk.age-threshold/v1") {
    const dateOfBirth = zkInput.dateOfBirth;
    if (!dateOfBirth) {
      throw new Error("This credential does not include date of birth for age proving.");
    }

    const { proveAgeClaimFromCredentialMetadata } = await import("@mintra/zk-claims");
    return proveAgeClaimFromCredentialMetadata({
      credentialMetadata: zkInput.credentialMetadata,
      dateOfBirth,
      minAge: request.requirements.ageGte,
      referenceDate: request.publicInputs.referenceDate,
      ...(zkInput.zkSalts?.dob ? { salt: BigInt(`0x${zkInput.zkSalts.dob}`) } : {}),
    });
  }

  if (request.proofType === "mintra.zk.kyc-passed/v1") {
    if (zkInput.kycPassed !== true) {
      throw new Error("This credential does not currently satisfy the KYC-passed proof.");
    }

    const { proveKycPassedFromCredentialMetadata } = await import("@mintra/zk-claims");
    return proveKycPassedFromCredentialMetadata({
      credentialMetadata: zkInput.credentialMetadata,
      kycPassed: zkInput.kycPassed,
      ...(zkInput.zkSalts?.kyc ? { salt: BigInt(`0x${zkInput.zkSalts.kyc}`) } : {}),
    });
  }

  const countryCodeNumeric = zkInput.countryCodeNumeric;
  if (!countryCodeNumeric) {
    throw new Error("This credential does not include a normalized country code for country proofs.");
  }

  const { proveCountryMembershipFromCredentialMetadata } = await import("@mintra/zk-claims");
  return proveCountryMembershipFromCredentialMetadata({
    credentialMetadata: zkInput.credentialMetadata,
    countryCodeNumeric,
    allowlistNumeric: request.publicInputs.allowlistNumeric,
    blocklistNumeric: request.publicInputs.blocklistNumeric,
    ...(zkInput.zkSalts?.country ? { salt: BigInt(`0x${zkInput.zkSalts.country}`) } : {}),
  });
}

async function ensureProofRuntime() {
  proofRuntimePromise ??= import("o1js").then(({ setNumberOfWorkers }) => {
    setNumberOfWorkers(1);
  });
  return proofRuntimePromise;
}

function shouldFallbackToBrowserProving(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("api error 404") ||
    message.includes("api error 405") ||
    message.includes("api error 501") ||
    message.includes("route post:/api/mina/zk-proof not found") ||
    message.includes("no approved verification found for this user")
  );
}
