<p align="center">
  <img src="./apps/demo-web/src/app/icon.svg" alt="Mintra logo" width="96" height="96" />
</p>

# Mintra

**Reusable verification for Mina apps.**

> Verify once, prove what matters.

Mintra is a developer platform that bridges real-world KYC providers into the Mina ecosystem. It integrates with providers like [Didit](https://didit.me), normalizes the result into typed, reusable claims, and exposes those claims through a clean SDK — with an adapter layer that maps them into [Mina Attestations](https://github.com/zksecurity/mina-attestations) credentials.

## Why Mintra exists alongside Mina Attestations

[mina-attestations](https://github.com/zksecurity/mina-attestations) (by zksecurity) is already a production-ready ZK credential library for Mina. Mintra does not replace it.

What Mintra adds:

| Layer | Mina Attestations | Mintra |
|-------|------------------|--------|
| ZK credential primitives | ✅ | builds on top |
| KYC provider integration | ❌ | ✅ (Didit, extensible) |
| Webhook handling + auth | ❌ | ✅ |
| Normalized claim model | ❌ | ✅ |
| Developer SDK | ❌ | ✅ |
| Reusable verification UX | ❌ | ✅ |
| Mina credential issuance | ✅ primitives | ✅ wires it up |

Mintra is the **provider bridge + claim normalization + SDK layer** that makes Mina Attestations usable for real-world identity applications without each app team building it from scratch.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Demo App (Next.js)          SDK Consumer               │
│  /verify → /claims → /protected                         │
└──────────────────────┬──────────────────────────────────┘
                       │ @mintra/sdk-js
┌──────────────────────▼──────────────────────────────────┐
│  @mintra/api  (Fastify + minimal persisted state)       │
│  POST /api/auth/challenge                               │
│  POST /api/auth/verify                                  │
│  POST /api/verifications/start                          │
│  GET  /api/verifications/:id/status                     │
│  POST /api/providers/didit/webhook  ← Didit             │
│  GET  /api/claims/:userId                               │
│  POST /api/mina/issue-credential                        │
└──────┬────────────────────────────┬───────────────────────┘
       │ @mintra/provider-didit     │
┌──────▼──────────┐        ┌─────────▼──────────────────────┐
│  Didit REST API │        │  @mintra/verifier             │
│  + Webhook      │        │  POST /api/verify-presentation│
│  + HMAC verify  │        │  GET  /health                 │
└─────────────────┘        └─────────┬──────────────────────┘
                                     │ @mintra/mina-bridge
                            ┌────────▼───────────────┐
                            │  mina-attestations     │
                            │  Credential.sign       │
                            │  Presentation.verify   │
                            └────────────────────────┘
```

See [docs/architecture.md](docs/architecture.md) for the full design.

## What This Repo Includes

- `apps/demo-web`: Next.js 14 frontend with wallet-first onboarding
- `services/api`: Fastify API for verification sessions, webhooks, claims, and Mina credential issuance
- `services/verifier`: dedicated proof verification service for Auro/Mina presentations
- `packages/provider-didit`: Didit provider adapter
- `packages/mina-bridge`: Mina credential issuance bridge
- `packages/sdk-js` and `packages/sdk-types`: shared SDK and schemas

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- A [Didit](https://studio.didit.me) account (500 free KYC checks/month, no minimums)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the API

```bash
cp services/api/.env.example services/api/.env
```

Edit `services/api/.env`:

```env
DIDIT_API_KEY=your_didit_api_key_here
DIDIT_WEBHOOK_SECRET=your_didit_workflow_webhook_secret_here
DIDIT_WORKFLOW_ID=your_didit_workflow_id_here
PORT=3001
CORS_ORIGIN=http://localhost:3000
MINA_SIGNER_NETWORK=mainnet
MINA_ISSUER_PRIVATE_KEY=                       # optional — only for credential issuance
```

### 3. Configure the verifier

```bash
cp services/verifier/.env.example services/verifier/.env
```

Edit `services/verifier/.env`:

```env
CORS_ORIGIN=http://localhost:3000
PORT=3002
```

### 4. Configure the demo app

Create `apps/demo-web/.env.local`:

```env
NEXT_PUBLIC_MINTRA_API_URL=http://localhost:3001
NEXT_PUBLIC_MINTRA_VERIFIER_URL=http://localhost:3002
```

### 5. Start everything

```bash
# Terminal 1: API
pnpm --filter @mintra/api dev

# Terminal 2: Verifier
pnpm --filter @mintra/verifier dev

# Terminal 3: Demo app
pnpm --filter @mintra/demo-web dev
```

Open [http://localhost:3000](http://localhost:3000).

## Current Demo Flow

1. Open the home page
2. Connect an Auro wallet
3. Start verification
4. Complete the hosted Didit KYC flow
5. Return to Mintra, review claims, and issue the Mina credential into Auro
6. Open `/protected` and prove the stored credential through the dedicated verifier service

The current frontend uses the linked wallet address as the verification user id. In production, replace local wallet-based identity with your real authentication and account model.

The API keeps wallet auth sessions in memory, and persists only minimal verification metadata and normalized claims to a local state file. Normalized claims expire after 30 days. The verifier service is intentionally separate so Mina proof verification does not compete with Didit webhooks and wallet issuance for memory.

## Getting Didit Credentials

1. Sign up at [studio.didit.me](https://studio.didit.me)
2. Create a new workflow (ID Verification + Face Match + Liveness is the standard Core KYC)
3. Set the redirect/callback URL to your deployed frontend callback page, for example:
   - local: `http://localhost:3000/verify/callback`
   - hosted: `https://your-frontend-domain/verify/callback`
4. Set the webhook URL to your API webhook endpoint:
   - local with tunnel: `https://your-tunnel-domain/api/providers/didit/webhook`
   - hosted: `https://your-api-domain/api/providers/didit/webhook`
5. Copy the API Key, Webhook Secret, and Workflow ID into `services/api/.env`

For local webhook testing, use a tunnel tool like [ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

## API Authentication

Browser clients authenticate with a signed wallet challenge:

1. `POST /api/auth/challenge`
2. Sign the returned message with `window.mina.signMessage(...)`
3. `POST /api/auth/verify`
4. Reuse the returned bearer token for:
   - `POST /api/verifications/start`
   - `GET /api/verifications/:id/status`
   - `GET /api/claims/:userId`
   - `POST /api/mina/issue-credential`
5. `POST /api/auth/logout` revokes the current browser session

The Didit webhook endpoint still uses HMAC-SHA256 (`x-signature-v2`) instead. Presentation verification does not query claims from Mintra; it happens through the separate verifier service.

## SDK Usage

```typescript
import { createMintraClient } from "@mintra/sdk-js";

const mintra = createMintraClient({
  apiBaseUrl: process.env.NEXT_PUBLIC_MINTRA_API_URL!,
});

// Start a verification session after a wallet auth challenge has been verified
const session = await mintra.startVerification({ userId: "B62..." });
// Redirect user to session.verificationUrl

// Poll for status
const status = await mintra.getVerificationStatus(session.sessionId);

// Fetch normalized claims after approval
const { claims } = await mintra.getClaims("B62...");
// { age_over_18: true, kyc_passed: true, country_code: "AT" }
```

## Monorepo Structure

```
apps/
  demo-web/              Next.js 14 demo application
packages/
  sdk-types/             Zod schemas + TypeScript types (shared)
  sdk-js/                App-facing Mintra SDK (fetch-based, browser+Node)
  provider-didit/        Didit provider integration
  mina-bridge/           mina-attestations adapter
services/
  api/                   Fastify backend + minimal persisted verification state
  verifier/              Dedicated Mina presentation verifier
docs/
  architecture.md
  security.md
  roadmap.md
  competition-and-positioning.md
  verifier-integration.md
```

## Current Limitations

- **Single provider**: Only Didit is integrated. Sumsub, Persona, Veriff are on the roadmap.
- **Dedicated verifier required for proof gating**: The demo now uses a separate verifier service for Mina/Auro proof checks. Plan to run it separately from the main API in production.
- **No raw KYC storage in Mintra**: Mintra does not store identity documents, selfies, or full KYC payloads. It keeps only minimal verification metadata, normalized claims, and webhook dedupe keys.
- **Provider-side retention still applies**: In the current setup, Didit retains the underlying verification data for 1 month, which is the shortest retention window Didit currently offers.
- **Mintra claim retention is 30 days**: normalized backend claims expire after 30 days and are removed on load/read.
- **Wallet address as user id**: The current demo uses the linked wallet address as the verification identifier. Production use should map verification state to real application accounts.
- **Ephemeral auth sessions**: Wallet sign-in sessions are short-lived and are cleared on API restart.
- **Mina credential issuance**: Functional, but wallet issuance requires `MINA_ISSUER_PRIVATE_KEY` to be set on the API. Key management guidance is in [docs/security.md](docs/security.md).
- **Verifier sizing matters**: `o1js` and `mina-attestations` proof verification are memory-heavy. Give `services/verifier` enough RAM or isolate it behind autoscaling.

## Hosting

### Railway (recommended — three services on one platform)

Railway supports monorepos natively. Deploy three services from the same repo:

- API service: build from the repo root
- Verifier service: build from the repo root
- Frontend service: build from the repo root

Recommended commands:

**API**

```bash
pnpm install --frozen-lockfile && pnpm run build:packages && pnpm --filter @mintra/api build
```

Start:

```bash
pnpm --filter @mintra/api start
```

**Verifier**

```bash
pnpm install --frozen-lockfile && pnpm run build:packages && pnpm --filter @mintra/verifier build
```

Start:

```bash
pnpm --filter @mintra/verifier start
```

**Frontend**

```bash
pnpm install --frozen-lockfile && pnpm run build:packages && pnpm --filter @mintra/demo-web build
```

Start:

```bash
pnpm --filter @mintra/demo-web start
```

**API service variables:**

| Variable | Description |
|---|---|
| `DIDIT_API_KEY` | From Didit Studio |
| `DIDIT_WEBHOOK_SECRET` | From Didit Studio |
| `DIDIT_WORKFLOW_ID` | From Didit Studio |
| `CORS_ORIGIN` | Your frontend Railway URL |
| `MINA_SIGNER_NETWORK` | `mainnet` or `testnet` for wallet signature verification |
| `MINA_ISSUER_PRIVATE_KEY` | Optional — Mina base58 private key |

**Verifier service variables:**

| Variable | Description |
|---|---|
| `CORS_ORIGIN` | Your frontend Railway URL |

**Frontend service variables:**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_MINTRA_API_URL` | Your API Railway URL |
| `NEXT_PUBLIC_MINTRA_VERIFIER_URL` | Your verifier Railway URL |

### Vercel + Railway

- Host `apps/demo-web` on Vercel (set project root to `apps/demo-web`)
- Host `services/api` on Railway with repo-root build commands
- Host `services/verifier` on Railway with repo-root build commands
- Same environment variables as above

## Verifier Integration

If another app wants to verify Mina presentations on its own backend instead of calling Mintra claims directly, see [docs/verifier-integration.md](docs/verifier-integration.md).

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## Security

See [docs/security.md](docs/security.md) for the threat model, data handling policy, and provider trust assumptions.

## License

MIT
