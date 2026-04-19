import { mintra, DEMO_USER_ID } from "@/lib/mintra";
import { Lock } from "lucide-react";
import Link from "next/link";

export default async function ProtectedPage() {
  let allowed = false;
  let error: string | null = null;

  try {
    const data = await mintra.getClaims(DEMO_USER_ID);
    allowed = data.claims.age_over_18 === true;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error";
  }

  if (error) {
    return (
      <div className="card" style={{ borderColor: "var(--danger)" }}>
        <p style={{ color: "var(--danger)", fontSize: 14 }}>API error: {error}</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="stack" style={{ alignItems: "center", paddingTop: 60 }}>
        <div className="card" style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <Lock size={36} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Access Denied</h1>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
            This feature requires the{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>age_over_18</code> claim.
            Complete identity verification to proceed.
          </p>
          <Link href="/verify" className="btn btn-primary">
            Start verification
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="badge badge-success">Verified Access</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Protected Feature</h1>
        <p style={{ color: "var(--muted)", marginTop: 6 }}>
          Unlocked because{" "}
          <code style={{ fontFamily: "var(--mono)", fontSize: 13 }}>age_over_18 = true</code>
        </p>
      </div>

      <div className="card" style={{ borderColor: "var(--success)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: "var(--success)" }}>
          Access granted
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.8 }}>
          This is a gated feature that requires a verified identity. In a production Mina
          application, this page would check a{" "}
          <strong style={{ color: "var(--text)" }}>Mina attestation</strong> rather than a server
          claim — the architecture is already structured for this via{" "}
          <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>@mintra/mina-bridge</code>.
        </p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>What&apos;s next</h2>
        <ul style={{ color: "var(--muted)", fontSize: 14, paddingLeft: 20, lineHeight: 2.2 }}>
          <li>
            Issue a <strong style={{ color: "var(--text)" }}>Mina native credential</strong> via{" "}
            <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
              POST /api/mina/issue-credential
            </code>
          </li>
          <li>
            Store the credential in an <strong style={{ color: "var(--text)" }}>Auro wallet</strong>
          </li>
          <li>
            Generate a{" "}
            <strong style={{ color: "var(--text)" }}>zero-knowledge proof of age</strong> without
            revealing any other claims
          </li>
          <li>
            Present the proof to a{" "}
            <strong style={{ color: "var(--text)" }}>Mina zkApp verifier</strong> fully on-chain
          </li>
        </ul>
        <p style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
          See{" "}
          <code style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
            packages/mina-bridge/src/presentation-spec.ts
          </code>{" "}
          for the v2 selective disclosure scaffold.
        </p>
      </div>
    </div>
  );
}
