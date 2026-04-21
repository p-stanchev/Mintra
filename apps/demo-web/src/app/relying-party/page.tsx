"use client";

import { requestPresentationWithHolderBinding } from "@/lib/auro-presentation";
import { getWalletById } from "@/lib/mina-wallet";
import { registerPasskey } from "@/lib/passkeys";
import {
  readLinkedWalletAddress,
  readLinkedWalletProviderId,
  readLinkedWalletProviderName,
} from "@/lib/wallet-session";
import type {
  PresentationRequestEnvelope,
  PresentationVerificationResult,
  ProofProductId,
} from "@mintra/sdk-types";
import { CheckCircle2, KeyRound, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

const productOptions: Array<{
  id: ProofProductId;
  label: string;
  description: string;
}> = [
  {
    id: "proof_of_age_18",
    label: "Age 18+",
    description: "Grant access only if the wallet proves age_over_18 and KYC passed.",
  },
  {
    id: "proof_of_kyc_passed",
    label: "KYC Passed",
    description: "Grant access if the wallet proves the user passed KYC without exposing extra fields.",
  },
];

export default function RelyingPartyPage() {
  const [productId, setProductId] = useState<ProofProductId>("proof_of_age_18");
  const [loading, setLoading] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PresentationVerificationResult | null>(null);
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  const [passkeyLabel, setPasskeyLabel] = useState<string | null>(null);
  const [walletProviderName, setWalletProviderName] = useState<string | null>(null);

  const verifierUrl =
    process.env.NEXT_PUBLIC_MINTRA_VERIFIER_URL?.replace(/\/$/, "") ?? "http://localhost:3002";

  useEffect(() => {
    const walletAddress = readLinkedWalletAddress();
    if (!walletAddress) {
      setPasskeyRegistered(false);
      setPasskeyLabel(null);
      return;
    }

    void fetch(`${verifierUrl}/api/passkeys/${walletAddress}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? "Could not load passkey status.");
        setPasskeyRegistered(Boolean(payload.registered));
        setPasskeyLabel(payload.deviceName ?? null);
      })
      .catch(() => {
        setPasskeyRegistered(false);
        setPasskeyLabel(null);
      });
  }, [verifierUrl]);

  async function handleRegisterPasskey() {
    const walletAddress = readLinkedWalletAddress();
    if (!walletAddress) {
      setMessage("Connect the verified wallet first.");
      return;
    }

    try {
      setRegisteringPasskey(true);
      setMessage(null);
      const deviceName = window.prompt("Optional device label for this passkey", "Primary device") ?? undefined;
      const registered = await registerPasskey({
        verifierUrl,
        walletAddress,
        ...(deviceName?.trim() ? { deviceName: deviceName.trim() } : {}),
      });
      setPasskeyRegistered(true);
      setPasskeyLabel(registered.deviceName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey registration failed.");
    } finally {
      setRegisteringPasskey(false);
    }
  }

  async function handleVerify() {
    const walletAddress = readLinkedWalletAddress();
    if (!walletAddress) {
      setMessage("Connect the verified wallet first.");
      setResult(null);
      return;
    }

    const provider = await getWalletById(readLinkedWalletProviderId());
    const providerName = readLinkedWalletProviderName();
    setWalletProviderName(providerName);
    if (!provider?.capabilities.requestPresentation) {
      setMessage(`${providerName ?? "This wallet"} is required to present the proof.`);
      setResult(null);
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      setResult(null);

      const accounts = provider.getAccounts ? await provider.getAccounts() : await provider.requestAccounts();
      const activeWallet = accounts[0];
      if (!activeWallet) throw new Error(`Connect ${provider.name} to continue.`);
      if (activeWallet !== walletAddress) {
        throw new Error("Reconnect the same wallet that completed verification.");
      }

      const requestResponse = await fetch(`${verifierUrl}/api/presentation-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proofProductId: productId,
          expectedOwnerPublicKey: activeWallet,
          requirePasskeyBinding: true,
        }),
      });

      const requestPayload = await requestResponse.json().catch(async () => ({
        error: await requestResponse.text(),
      }));
      if (!requestResponse.ok) {
        throw new Error(requestPayload?.error ?? "Could not create presentation request.");
      }

      const requestEnvelope = requestPayload.requestEnvelope as PresentationRequestEnvelope;
      const presentationEnvelope = await requestPresentationWithHolderBinding({
        provider,
        requestEnvelope,
        walletAddress: activeWallet,
        verifierUrl,
        walletProviderName: provider.name,
        clientVersion: "demo-web/relying-party",
      });

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

      const verifyPayload = await verifyResponse.json().catch(async () => ({
        error: await verifyResponse.text(),
      }));
      if (!verifyResponse.ok) {
        throw new Error(
          verifyPayload?.error?.message ?? verifyPayload?.error ?? "Proof verification failed."
        );
      }

      setResult(verifyPayload as PresentationVerificationResult);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Proof verification failed.");
    } finally {
      setLoading(false);
    }
  }

  const selectedProduct = productOptions.find((product) => product.id === productId) ?? productOptions[0];

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-line bg-white p-8 shadow-card sm:p-10">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-fog px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate">
          <ShieldCheck className="h-3.5 w-3.5" />
          Relying Party Demo
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Consume Mintra proofs the way an external app would.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate">
          The verifier service acts as the relying party backend. It issues a presentation request,
          checks the Mina proof, verifies the wallet holder-binding signature, requires a passkey
          assertion for the same challenge and proof hash, enforces audience binding, and returns a
          backend-friendly access decision.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Requested proof</h2>
          <div className="mt-6 space-y-3">
            {productOptions.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setProductId(product.id)}
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                  productId === product.id
                    ? "border-ink bg-fog"
                    : "border-line bg-white hover:bg-fog"
                }`}
              >
                <div className="font-medium text-ink">{product.label}</div>
                <div className="mt-1 text-sm text-slate">{product.description}</div>
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-fog px-4 py-4 text-sm text-slate">
            <div className="mb-2 flex items-center gap-2 font-medium text-ink">
              <KeyRound className="h-4 w-4" />
              Passkey status
            </div>
            <p>
              {passkeyRegistered
                ? `Registered${passkeyLabel ? `: ${passkeyLabel}` : "."}`
                : "No passkey registered for this wallet yet."}
            </p>
            <button
              type="button"
              onClick={() => void handleRegisterPasskey()}
              disabled={registeringPasskey}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-fog disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {registeringPasskey ? "Registering…" : passkeyRegistered ? "Register another passkey" : "Register passkey"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={loading}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
          >
            {loading ? <Wallet className="h-4 w-4 animate-pulse" /> : <ShieldCheck className="h-4 w-4" />}
            {loading ? "Verifying…" : `Request ${selectedProduct.label} proof${walletProviderName ? ` with ${walletProviderName}` : ""}`}
          </button>
        </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-line bg-white p-8 shadow-card">
            <h2 className="text-xl font-semibold tracking-tight text-ink">Backend outcome</h2>
            <p className="mt-3 text-sm leading-7 text-slate">
              This is the result shape that the verifier backend returns to an integrator after proof
              validation. This demo now requires both wallet and passkey holder binding.
            </p>
            {!result && !message && (
              <div className="mt-6 rounded-2xl border border-dashed border-line bg-fog px-5 py-8 text-sm text-slate">
              Run the flow to see an access decision.
            </div>
          )}

            {message && (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <XCircle className="h-4 w-4" />
                  Access denied
                </div>
                {message}
              </div>
            )}

            {result && (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Access granted
                </div>
                <pre className="mt-4 overflow-x-auto rounded-2xl border border-emerald-200 bg-white p-4 text-xs text-ink">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
