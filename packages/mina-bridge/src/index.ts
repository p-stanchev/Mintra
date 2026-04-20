export { MinaBridge, createMinaBridge } from "./bridge";
export type { MinaBridgeConfig } from "./bridge";
export { claimsToCredentialData } from "./mapping";
export {
  DEFAULT_AGE_PROOF_ACTION,
  warmUpPresentationTools,
  buildAgeOver18PresentationRequest,
  serializePresentationRequest,
  parsePresentationRequest,
  parseHttpsPresentationRequest,
  verifyAgeOver18Presentation,
} from "@mintra/verifier-core";
