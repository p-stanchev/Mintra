# Mintra Docs

This folder documents the current Mintra architecture and product surface.

Start here:

- [what-is-mintra.md](./what-is-mintra.md)
- [architecture.md](./architecture.md)
- [verifier-integration.md](./verifier-integration.md)
- [how-credentials-work.md](./how-credentials-work.md)
- [zk-proofs-and-registry.md](./zk-proofs-and-registry.md)
- [zk-contracts-package.md](./zk-contracts-package.md)
- [zkapp-age-gate-example.md](./zkapp-age-gate-example.md)

Current reusable-proof model:

- wallet credential for presentation reuse
- issuer-signed proof-material bundle for zk proving reuse
- wallet-native proof-material storage when supported
- local import/export only as backup and recovery
- no required Mintra online claim state at proof time when valid signed proof material is present

Supporting docs:

- [how-presentations-work.md](./how-presentations-work.md)
- [off-chain-verification.md](./off-chain-verification.md)
- [consume-proofs.md](./consume-proofs.md)
- [preventing-proof-sharing.md](./preventing-proof-sharing.md)
- [replay-protection-and-audience-binding.md](./replay-protection-and-audience-binding.md)
- [security.md](./security.md)
- [security-considerations.md](./security-considerations.md)
- [zkapp-integration.md](./zkapp-integration.md)
- [roadmap.md](./roadmap.md)

Backend examples:

- [fastify-presentation-route.md](./fastify-presentation-route.md)
- [next-presentation-route.md](./next-presentation-route.md)
