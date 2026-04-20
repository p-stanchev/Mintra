# Mintra Roadmap

## Current

Implemented today:
- Didit session creation + webhook processing
- normalized claims:
  - `age_over_18`
  - `kyc_passed`
  - `country_code`
- wallet-first browser flow
- signed wallet challenge auth
- wallet-bound claims access
- wallet-bound Mina credential issuance
- Auro credential storage
- dedicated verifier service for Auro/Mina presentations
- protected-route gating from verified wallet proofs
- minimal persisted verification state
- frontend CSP + security headers

## Next

### Short term

- Replace local JSON state with a deployment-grade persistent store
- Add session/activity monitoring around repeated auth failures and webhook rejects
- Tighten CSP further if the frontend can move away from any remaining inline allowances
- Add automated tests around logout / session freshness / auth expiry
- Add a clean “reauthenticate wallet” UX when the fresh-session window expires

### Credential and verifier flows

- additional presentation specs beyond 18+
- selective disclosure demos
- verifier deployment templates
- third-party verifier SDK wrapper

### Provider expansion

- Sumsub adapter
- Persona adapter
- Veriff adapter

### Production hardening

- encrypted-at-rest persistent backend
- revocation / suspension model for issued credentials
- stronger audit event pipeline
- environment-specific issuer keys and public issuer registry

### Ecosystem

- publish `@mintra/sdk-js`
- deployment docs and hosted example
- Mina app integration guides
