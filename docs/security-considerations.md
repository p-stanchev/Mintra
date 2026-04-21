# Security Considerations

## Core Controls

- wallet-bound auth for Mintra API routes
- Didit webhook HMAC verification
- minimal normalized-claims persistence
- verifier challenge issuance
- single-use challenge replay protection
- atomic challenge consumption in Redis-backed production deployments
- audience binding
- holder-binding wallet signatures

## Operational Guidance

- run `services/verifier` separately from `services/api`
- give the verifier enough RAM for `o1js` proof verification
- treat `MINA_ISSUER_PRIVATE_KEY` like a high-value issuer secret
- keep `CORS_ORIGIN` locked to trusted frontend origins
- configure `REDIS_URL` when the verifier runs on more than one instance
- rotate secrets on any suspected exposure

## Product Limits

Mintra currently does not guarantee:

- hardware-backed device attestation
- revocation roots enforced on-chain
- full anti-collusion resistance
- zero trust in the external KYC provider
