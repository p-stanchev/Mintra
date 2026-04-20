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
│  @mintra/api  (Fastify + in-memory store)               │
│  POST /api/verifications/start                          │
│  GET  /api/verifications/:id/status                     │
│  POST /api/providers/didit/webhook  ← Didit             │
│  GET  /api/claims/:userId                               │
│  POST /api/mina/issue-credential                        │
└──────┬───────────────────────────────────┬──────────────┘
       │ @mintra/provider-didit            │ @mintra/mina-bridge
┌──────▼──────────┐              ┌─────────▼───────────────┐
│  Didit REST API │              │  mina-attestations      │
│  + Webhook      │              │  Credential.sign        │
│  + HMAC verify  │              │  (v2: Presentation)     │
└─────────────────┘              └─────────────────────────┘
```

See [docs/architecture.md](docs/architecture.md) for the full design.

## What This Repo Includes

- `apps/demo-web`: Next.js 14 frontend with wallet-first onboarding
- `services/api`: Fastify API for verification sessions, webhooks, claims, and Mina credential issuance
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

### 3. Configure the demo app

Create `apps/demo-web/.env.local`:

```env
NEXT_PUBLIC_MINTRA_API_URL=http://localhost:3001
```

### 4. Start everything

```bash
# Terminal 1: API
pnpm --filter @mintra/api dev

# Terminal 2: Demo app
pnpm --filter @mintra/demo-web dev
```

Open [http://localhost:3000](http://localhost:3000).

## Current Demo Flow

1. Open the home page
2. Connect an Auro wallet
3. Start verification
4. Complete the hosted Didit KYC flow
5. Return to Mintra and issue the Mina credential into Auro

The current frontend uses the linked wallet address as the verification user id. In production, replace local wallet-based identity with your real authentication and account model.

The API keeps verification state and short-lived wallet auth sessions in memory for a lightweight demo setup. That means you do not need a database, but an API restart will clear in-flight verification state and sign-in sessions.

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

The Didit webhook endpoint still uses HMAC-SHA256 (`x-signature-v2`) instead.

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
const { claims } = await mintra.getClaims("user_123");
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
  api/                   Fastify backend + in-memory state
docs/
  architecture.md
  security.md
  roadmap.md
  competition-and-positioning.md
```

## Current Limitations

- **Single provider**: Only Didit is integrated. Sumsub, Persona, Veriff are on the roadmap.
- **Off-chain claims only (v1)**: Claims are stored server-side. Mina on-chain proof generation is v2.
- **No raw KYC storage in Mintra**: Mintra does not store identity documents, selfies, or full KYC payloads. It keeps only minimal in-memory verification linkage and normalized claims, so an API restart clears in-flight verification state.
- **Provider-side retention still applies**: In the current setup, Didit retains the underlying verification data for 1 month, which is the shortest retention window Didit currently offers.
- **Wallet address as user id**: The current demo uses the linked wallet address as the verification identifier. Production use should map verification state to real application accounts.
- **In-memory auth sessions**: Wallet sign-in sessions are ephemeral and are cleared on API restart.
- **Mina credential issuance**: Functional, but wallet issuance requires `MINA_ISSUER_PRIVATE_KEY` to be set on the API. Key management guidance is in [docs/security.md](docs/security.md).
- **Auro storage only**: The demo supports connecting Auro and storing the credential there. Presentation/proof flows are still v2 work.

## Hosting

### Railway (recommended — both services on one platform)

Railway supports monorepos natively. Deploy two services from the same repo:

- API service root: `services/api`
- Frontend service root: `apps/demo-web`

**API service variables:**

| Variable | Description |
|---|---|
| `DIDIT_API_KEY` | From Didit Studio |
| `DIDIT_WEBHOOK_SECRET` | From Didit Studio |
| `DIDIT_WORKFLOW_ID` | From Didit Studio |
| `CORS_ORIGIN` | Your frontend Railway URL |
| `MINA_SIGNER_NETWORK` | `mainnet` or `testnet` for wallet signature verification |
| `MINA_ISSUER_PRIVATE_KEY` | Optional — Mina base58 private key |

**Frontend service variables:**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_MINTRA_API_URL` | Your API Railway URL |

### Vercel + Railway

- Host `apps/demo-web` on Vercel (set project root to `apps/demo-web`)
- Host `services/api` on Railway (set service root to `services/api`)
- Same environment variables as above

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## Security

See [docs/security.md](docs/security.md) for the threat model, data handling policy, and provider trust assumptions.

## License

MIT
