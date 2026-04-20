export { MinaBridge, createMinaBridge } from "./bridge";
export type { MinaBridgeConfig } from "./bridge";
export { claimsToCredentialData } from "./mapping";
export {
  DEFAULT_AGE_PROOF_ACTION,
  buildAgeOver18PresentationRequest,
  verifyAgeOver18Presentation,
} from "./presentation-spec";
