# Self-Hosting the Verifier

`services/verifier` is designed to run as a standalone relying-party verifier, not only as Mintra-hosted infrastructure.

The default trust model is now:

- resolve trusted issuer and proof-program VK hashes from `MintraRegistry` on Mina
- use local env configuration only as a fallback or explicit override
- verify signed proof-material bundles and fresh verifier-bound proofs on your own backend

## Trust Source Modes

The verifier supports three trust-source modes:

- `TRUST_SOURCE=auto`
  - preferred default
  - if `MINTRA_REGISTRY_ADDRESS` and `MINA_GRAPHQL_URL` are set, resolve trust anchors from Mina
  - if registry resolution fails, fall back to `TRUSTED_ISSUER_PUBLIC_KEY` when present
- `TRUST_SOURCE=registry`
  - require registry resolution at startup
  - fail startup if the registry cannot be read or if the registry VK hashes do not match the verifier's compiled proof programs
- `TRUST_SOURCE=env`
  - skip Mina registry lookup
  - trust only the configured `TRUSTED_ISSUER_PUBLIC_KEY`

## Required Environment

Example:

```env
CORS_ORIGIN=https://app.example.com
VERIFIER_PUBLIC_URL=https://verifier.example.com
TRUST_SOURCE=auto
TRUSTED_ISSUER_PUBLIC_KEY=B62...
MINTRA_REGISTRY_ADDRESS=B62...
MINA_GRAPHQL_URL=https://api.minascan.io/node/devnet/v1/graphql
REDIS_URL=redis://user:password@host:6379
PORT=3002
```

Notes:

- `TRUSTED_ISSUER_PUBLIC_KEY` is still useful in `auto` mode as a fallback if registry lookup is temporarily unavailable.
- `MINTRA_REGISTRY_ADDRESS` should be the deployed `MintraRegistry` zkApp address, not the issuer key.
- `MINA_GRAPHQL_URL` should point to the same network where the registry is deployed.
- if registry trust is active, the registry's `issuerPublicKey` is the effective trusted issuer even when `TRUSTED_ISSUER_PUBLIC_KEY` is also set

## What the Verifier Resolves from the Registry

When registry mode is active, the verifier reads:

- trusted issuer public key
- age proof verification-key hash
- KYC proof verification-key hash
- country proof verification-key hash
- credential root
- revocation root

The verifier compares the on-chain VK hashes against its locally compiled proof programs. If they do not match, the verifier refuses registry trust.

## Issuer Alignment

When `trustSource` resolves to `registry`, the active issuer comes from the registry, not the env fallback.

To keep the whole stack consistent:

- `MINA_ISSUER_PRIVATE_KEY` on the API should derive to the registry issuer public key
- `NEXT_PUBLIC_MINTRA_TRUSTED_ISSUER_PUBLIC_KEY` on `demo-web` should match the registry issuer public key
- `TRUSTED_ISSUER_PUBLIC_KEY` on the verifier should also match it, even if it is present only as an `auto`-mode fallback

If those are not aligned, old signed bundles and newly issued bundles can drift away from the verifier's actual trust source.

## Docker

Build from the repo root:

```bash
docker build -f services/verifier/Dockerfile -t mintra-verifier .
```

Run:

```bash
docker run --rm -p 3002:3002 \
  -e CORS_ORIGIN=https://app.example.com \
  -e VERIFIER_PUBLIC_URL=https://verifier.example.com \
  -e TRUST_SOURCE=auto \
  -e TRUSTED_ISSUER_PUBLIC_KEY=B62... \
  -e MINTRA_REGISTRY_ADDRESS=B62... \
  -e MINA_GRAPHQL_URL=https://api.minascan.io/node/devnet/v1/graphql \
  -e REDIS_URL=redis://user:password@host:6379 \
  mintra-verifier
```

## Health and Runtime Visibility

`GET /health` now exposes:

- `trustSourceMode`
- `trustSource`
- `trustedIssuerPublicKey`
- compiled `verificationKeyHashes`
- resolved registry summary when available
- `registryError` when auto mode had to fall back

This is useful for confirming whether a deployment is really using Mina registry trust or silently falling back to env configuration.

## Recommended Production Shape

- run `services/verifier` separately from `services/api`
- use Redis for presentation challenge replay protection
- use `TRUST_SOURCE=registry` once your Mina registry is stable
- keep `TRUSTED_ISSUER_PUBLIC_KEY` populated as an operational fallback only when you intentionally want `auto` mode behavior

## Related Docs

- [verifier-integration.md](./verifier-integration.md)
- [zk-proofs-and-registry.md](./zk-proofs-and-registry.md)
- [credential-and-proof-authenticity.md](./credential-and-proof-authenticity.md)
