"use client";

import { requestPresentationWithHolderBinding } from "@/lib/auro-presentation";
import {
  readLinkedWalletAddress,
  readLinkedWalletProviderId,
  readLinkedWalletProviderName,
} from "@/lib/wallet-session";
import { getWalletById } from "@/lib/mina-wallet";
import { mintra } from "@/lib/mintra";
import { Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  GetZkProofInputResponse,
  PresentationRequestEnvelope,
  PresentationVerificationResult,
  ZkPolicyRequest,
  ZkVerificationResult,
} from "@mintra/sdk-types";

type Mode = "wallet" | "zk";
type WalletStep = "requesting" | "proving" | "verifying";
type ZkStep = "loading-input" | "requesting-policy" | "proving" | "verifying";

export default function ProtectedPage() {
  const [mode, setMode] = useState<Mode>("wallet");
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [walletStep, setWalletStep] = useState<WalletStep>("requesting");
  const [zkStep, setZkStep] = useState<ZkStep>("loading-input");
  const [error, setError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<PresentationVerificationResult | ZkVerificationResult | null>(null);
  const [walletProviderName, setWalletProviderName] = useState<string | null>(null);

  const requestWalletProof = useCallback(async () => {
    const walletAddress = readLinkedWalletAddress();
    const providerName = readLinkedWalletProviderName();
    setWalletProviderName(providerName);

    if (!walletAddress) {
      setAllowed(false);
      setError("Connect the verified wallet to prove your 18+ credential.");
      setLoading(false);
      return;
    }

    const provider = await getWalletById(readLinkedWalletProviderId());
    if (!provider?.capabilities.requestPresentation) {
      setAllowed(false);
      setError(`${providerName ?? "This wallet"} does not support Mina proof presentation in this flow.`);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setWalletStep("requesting");
      setError(null);

      const accounts = await provider.getAccounts();
      const activeWallet = accounts[0];

      if (!activeWallet) {
        throw new Error(`Connect ${provider.name} to continue.`);
      }

      if (activeWallet !== walletAddress) {
        throw new Error("Reconnect the same wallet that completed verification.");
      }

      const verifierUrl =
        process.env.NEXT_PUBLIC_MINTRA_VERIFIER_URL?.replace(/\/$/, "") ??
        "http://localhost:3002";

      const requestResponse = await fetch(`${verifierUrl}/api/presentation-request`, {
        method: "GET",
      });

      if (!requestResponse.ok) {
        const body = await requestResponse.text();
        throw new Error(`Could not create proof request: ${body}`);
      }

      const { requestEnvelope }: { requestEnvelope: PresentationRequestEnvelope } =
        await requestResponse.json();

      setWalletStep("proving");
      const presentationEnvelope = await requestPresentationWithHolderBinding({
        provider,
        requestEnvelope,
        walletAddress: activeWallet,
        verifierUrl,
        walletProviderName: provider.name,
        clientVersion: "demo-web/protected",
      });

      setWalletStep("verifying");
      const verifyResponse = await fetch(`${verifierUrl}/api/verify-presentation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentationEnvelope,
          expectedOwnerPublicKey: activeWallet,
        }),
      });

      if (!verifyResponse.ok) {
        const body = await verifyResponse.json().catch(async () => ({
          error: await verifyResponse.text(),
        }));
        throw new Error(body?.error?.message ?? body?.error ?? "Proof verification failed.");
      }

      const result = (await verifyResponse.json()) as PresentationVerificationResult;
      setVerificationResult(result);
      setAllowed(true);
      setLoading(false);
    } catch (err) {
      setAllowed(false);
      setError(err instanceof Error ? err.message : "Could not verify the wallet credential.");
      setLoading(false);
    }
  }, []);

  const requestZkProof = useCallback(async () => {
    const walletAddress = readLinkedWalletAddress();
    const providerName = readLinkedWalletProviderName();
    setWalletProviderName(providerName);

    if (!walletAddress) {
      setAllowed(false);
      setError("Connect and authenticate the verified wallet first.");
      setLoading(false);
      return;
    }

    const verifierUrl =
      process.env.NEXT_PUBLIC_MINTRA_VERIFIER_URL?.replace(/\/$/, "") ??
      "http://localhost:3002";

    try {
      setLoading(true);
      setError(null);

      setZkStep("loading-input");
      const zkInput: GetZkProofInputResponse = await mintra.getZkProofInput(walletAddress);

      if (!zkInput.dateOfBirth) {
        throw new Error("This credential does not include date of birth for age proving.");
      }

      setZkStep("requesting-policy");
      const policyResponse = await fetch(`${verifierUrl}/api/zk/policy-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proofType: "mintra.zk.age-threshold/v1", minAge: 18 }),
      });

      if (!policyResponse.ok) {
        const body = await policyResponse.json().catch(async () => ({ error: await policyResponse.text() }));
        throw new Error(body?.error ?? "Could not create zk policy request.");
      }

      const zkRequest = (await policyResponse.json()) as Extract<ZkPolicyRequest, { proofType: "mintra.zk.age-threshold/v1" }>;

      setZkStep("proving");
      const { proveAgeClaimFromCredentialMetadata } = await import("@mintra/zk-claims");

      const proof = await proveAgeClaimFromCredentialMetadata({
        credentialMetadata: zkInput.credentialMetadata,
        dateOfBirth: zkInput.dateOfBirth,
        minAge: zkRequest.requirements.ageGte,
        referenceDate: zkRequest.publicInputs.referenceDate,
        ...(zkInput.zkSalts?.dob ? { salt: BigInt(`0x${zkInput.zkSalts.dob}`) } : {}),
      });

      setZkStep("verifying");
      const verifyResponse = await fetch(`${verifierUrl}/api/zk/verify-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: zkRequest, proof: proof.toJSON() }),
      });

      if (!verifyResponse.ok) {
        const body = await verifyResponse.json().catch(async () => ({ error: await verifyResponse.text() }));
        throw new Error(body?.error?.message ?? body?.error ?? "ZK proof verification failed.");
      }

      const result = (await verifyResponse.json()) as ZkVerificationResult;
      setVerificationResult(result);
      setAllowed(true);
      setLoading(false);
    } catch (err) {
      setAllowed(false);
      setError(err instanceof Error ? err.message : "Could not run zk proof flow.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "wallet") void requestWalletProof();
  }, [mode, requestWalletProof]);

  const walletStepLabels: Record<WalletStep, { label: string; detail: string }> = {
    requesting: {
      label: `Sending proof request to ${walletProviderName ?? "wallet"}…`,
      detail: "Check the wallet and approve the credential request.",
    },
    proving: {
      label: `${walletProviderName ?? "Wallet"} is generating the ZK proof…`,
      detail: "This takes 30–90 seconds. The wallet is computing the proof — don't close it.",
    },
    verifying: {
      label: "Verifying proof on server…",
      detail: "Almost done.",
    },
  };

  const zkStepLabels: Record<ZkStep, string> = {
    "loading-input": "Loading credential-bound proof input…",
    "requesting-policy": "Requesting verifier zk policy…",
    proving: "Generating proof in the browser…",
    verifying: "Verifying proof with the verifier…",
  };

  if (loading) {
    const label =
      mode === "wallet"
        ? walletStepLabels[walletStep].label
        : zkStepLabels[zkStep];
    const detail =
      mode === "wallet" ? walletStepLabels[walletStep].detail : undefined;

    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <p style={{ fontWeight: 600, marginBottom: 6 }}>{label}</p>
        {detail && <p style={{ color: "var(--muted)", fontSize: 13 }}>{detail}</p>}
      </div>
    );
  }

  if (error) {
    return (
      <div className="stack" style={{ alignItems: "center", paddingTop: 60 }}>
        <div className="card" style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <Lock size={36} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Access Denied</h1>
          <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 24 }}>{error}</p>

          <div className="row" style={{ justifyContent: "center", gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              className={`btn ${mode === "wallet" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMode("wallet")}
            >
              Wallet proof
            </button>
            <button
              type="button"
              className={`btn ${mode === "zk" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMode("zk")}
            >
              ZK verifier proof
            </button>
          </div>

          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setError(null);
                if (mode === "wallet") void requestWalletProof();
                else void requestZkProof();
              }}
            >
              Retry with {mode === "wallet" ? (walletProviderName ?? "wallet") : "ZK verifier"}
            </button>
            <Link href="/verify" className="btn btn-secondary">
              Start verification
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="stack" style={{ alignItems: "center", paddingTop: 60 }}>
        <div className="card" style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <Lock size={36} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Choose a proof mode</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
            Prove your <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>age_over_18</code> claim
            using either the Auro wallet presentation flow or a direct ZK verifier proof.
          </p>

          <div className="row" style={{ justifyContent: "center", gap: 8, marginBottom: 20 }}>
            <button
              type="button"
              className={`btn ${mode === "wallet" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMode("wallet")}
            >
              Wallet proof
            </button>
            <button
              type="button"
              className={`btn ${mode === "zk" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMode("zk")}
            >
              ZK verifier proof
            </button>
          </div>

          <div className="row" style={{ justifyContent: "center", gap: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (mode === "wallet") void requestWalletProof();
                else void requestZkProof();
              }}
            >
              {mode === "wallet" ? `Prove with ${walletProviderName ?? "wallet"}` : "Prove with ZK verifier"}
            </button>
            <Link href="/verify" className="btn btn-secondary">
              Start verification
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isZkResult = verificationResult && "proofType" in verificationResult;
  const challengeId =
    verificationResult && "challenge" in verificationResult
      ? verificationResult.challenge?.challengeId
      : verificationResult && "challengeId" in verificationResult
        ? verificationResult.challengeId
        : undefined;

  const ownerPublicKey =
    verificationResult && "ownerPublicKey" in verificationResult
      ? verificationResult.ownerPublicKey
      : undefined;

  return (
    <div className="stack">
      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="badge badge-success">Verified Access</span>
          {isZkResult && (
            <span className="badge" style={{ marginLeft: 8 }}>
              <ShieldCheck size={12} style={{ display: "inline", marginRight: 4 }} />
              ZK proof
            </span>
          )}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Verification successful</h1>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>
          {isZkResult
            ? "The Mintra ZK verifier confirmed a valid age proof for this credential."
            : `${walletProviderName ?? "Your wallet"} produced a valid presentation for the linked wallet's `}
          {!isZkResult && (
            <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>age_over_18</code>
          )}
          {!isZkResult && " credential."}
        </p>
      </div>

      <div className="card" style={{ borderColor: "var(--success)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "var(--success)" }}>
          Access granted
        </h2>
        {challengeId && (
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
            Challenge{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{challengeId}</code>
            {ownerPublicKey && (
              <>
                {" "}verified for{" "}
                <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{ownerPublicKey}</code>
              </>
            )}
            .
          </p>
        )}
      </div>
    </div>
  );
}
