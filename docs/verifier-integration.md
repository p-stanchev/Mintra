# Verifier Integration

## Why run a verifier separately

Mina presentation verification is the heavy part of the stack:

- it loads `o1js`
- it loads `mina-attestations`
- it runs `Presentation.verify(...)`

That work is independent of Didit session management and wallet-authenticated claim issuance. In production, keep it on its own service so:

- webhook handling stays responsive
- credential issuance stays lightweight
- verifier memory can scale independently

## What the verifier does

`services/verifier` exposes:

- `GET /api/presentation-request`
- `POST /api/verify-presentation`
- `GET /health`

It does **not** read Mintra claims or query Didit. It creates verifier-bound presentation requests and verifies the wallet-generated presentation against the exact request it issued.

## Reusable package

The reusable proof helpers live in `@mintra/verifier-core`.

Like `@mintra/sdk-js`, this package exists in the monorepo today and is not published to npm yet. Until it is published, another team should either vendor the package code or copy the `services/verifier` reference service into its own repo.

That package contains the public building blocks another app needs:

- `buildAgeOver18PresentationRequest()`
- `serializePresentationRequest()`
- `parsePresentationRequest()`
- `verifyAgeOver18Presentation()`

`services/verifier` is just a reference Fastify wrapper around those helpers. Another team can run that service as-is, or call `@mintra/verifier-core` directly from their own backend.

## Request contract

`GET /api/presentation-request`

Success response:

```json
{
  "presentationRequest": { "...": "..." },
  "presentationRequestJson": "{\"type\":\"https\",...}"
}
```

Behavior:

- creates the age-over-18 HTTPS presentation request on the verifier backend
- serializes it for the frontend and for later verification
- keeps the verifier in control of the request format and server nonce

`POST /api/verify-presentation`

```json
{
  "presentation": "<presentation-json-string>",
  "presentationRequestJson": "<serialized-request-json-string>",
  "expectedOwnerPublicKey": "B62..."
}
```

Behavior:

- parses the serialized HTTPS presentation request
- verifies the returned presentation with `Presentation.verify(...)`
- checks that the credential owner in the proof matches `expectedOwnerPublicKey`
- checks that the proof satisfies the built-in `ageOver18 == 1` and `kycPassed == 1` constraints

Success response:

```json
{
  "verified": true,
  "ownerPublicKey": "B62...",
  "ageOver18": true
}
```

## Current frontend flow

The demo app does this on `/protected`:

1. fetch a presentation request from `services/verifier`
2. send it to Auro with `window.mina.requestPresentation(...)`
3. forward the returned presentation back to `services/verifier`
4. unlock the page only if the verifier accepts it

That means:

- Mintra API is still used for verification sessions, claims, and issuance
- the verifier is only used for proof validation

## How another app should use it

Another app should follow the same model on its own server:

1. define the credential schema and constraints it cares about
2. build a `PresentationRequest`
3. ask the user’s wallet for a presentation
4. send the wallet response to a verifier backend
5. verify server-side before granting access

Do **not** treat “wallet returned something” as equivalent to proof verification in production.

### Minimal backend flow

On another backend, the flow is:

1. install or vendor the verifier helpers
2. build the request on the backend the frontend will ask Auro to satisfy
3. serialize that request and send it to the frontend
4. receive `presentation` and `presentationRequestJson` back from the frontend
5. verify the presentation on your own server
6. compare the verified owner to the wallet your app expects

Example:

```ts
import {
  buildAgeOver18PresentationRequest,
  serializePresentationRequest,
  parsePresentationRequest,
  verifyAgeOver18Presentation,
} from "@mintra/verifier-core";

const request = await buildAgeOver18PresentationRequest();
const presentationRequestJson = JSON.stringify(
  await serializePresentationRequest(request)
);

// send presentationRequestJson to the frontend, then receive it back with the wallet presentation
const parsedRequest = await parsePresentationRequest(presentationRequestJson);
const verified = await verifyAgeOver18Presentation({
  request: parsedRequest,
  presentationJson,
  verifierIdentity: "https://your-app.example",
});

const ownerPublicKey = verified.ownerPublicKey;
const ageOver18 = verified.ageOver18;
```

If `ownerPublicKey` matches the wallet your app expects and `ageOver18` is true, the verifier can grant access without querying Mintra.

## Example verifier service deployment

Run `services/verifier` separately with:

```env
CORS_ORIGIN=https://your-frontend-domain
PORT=3002
```

Recommended deploy model:

- `services/api` on one Railway service
- `services/verifier` on a separate Railway service with more memory
- `apps/demo-web` on Vercel or Railway

### Railway setup

Create a third Railway service from the same monorepo and use the repo root as the source context.

Build command:

```bash
pnpm install --frozen-lockfile && pnpm run build:packages && pnpm --filter @mintra/verifier build
```

Start command:

```bash
pnpm --filter @mintra/verifier start
```

Required Railway variables:

```env
CORS_ORIGIN=https://your-frontend-domain
```

After deploy, verify the service with:

```text
https://your-verifier-domain/health
```

Expected response:

```json
{"ok":true,"service":"mintra-verifier"}
```

### Frontend wiring

The frontend must know the verifier URL separately from the API URL.

Set:

```env
NEXT_PUBLIC_MINTRA_VERIFIER_URL=https://your-verifier-domain
```

The demo frontend will then:

1. request a presentation from Auro
2. post that presentation to `NEXT_PUBLIC_MINTRA_VERIFIER_URL`
3. unlock `/protected` only after the verifier accepts it

## Using the verifier from another backend

If you want a third-party app to verify the same proof model, it has two choices:

### 1. Run Mintra's verifier code directly

Reuse the code in:

- [`../services/verifier`](../services/verifier)
- [`../packages/verifier-core`](../packages/verifier-core)

This is the preferred option if they want full control.

### 2. Mirror the same presentation spec

They can build the same request shape themselves:

- native credential fields:
  - `ageOver18`
  - `kycPassed`
  - `countryCode`
  - `issuedAt`
- required assertions:
  - `ageOver18 == 1`
  - `kycPassed == 1`
- output claims:
  - `ageOver18`
  - `owner`

The key requirement is that verifier and wallet agree on the exact request that is being proven.

## Security notes

- Restrict `CORS_ORIGIN` to your frontend origin
- Treat the verifier as public verification infrastructure, not a claims oracle
- Size the verifier for proof workloads; do not colocate it with lightweight webhook handling on tiny instances
- Keep the main API and verifier independently deployable
