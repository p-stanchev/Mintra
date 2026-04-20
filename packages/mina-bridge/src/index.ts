export { MinaBridge, createMinaBridge } from "./bridge";
export type { MinaBridgeConfig } from "./bridge";
export { claimsToCredentialData } from "./mapping";
export {
  buildAgeOver18PresentationRequest,
  parsePresentationRequest,
  parseHttpsPresentationRequest,
  verifyAgeOver18Presentation,
} from "./presentation-spec";
