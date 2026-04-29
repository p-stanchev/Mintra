import { verifyPresentationWithRegistry as verifyPresentationWithRegistryCore } from "@mintra/verifier-core";
import type {
  PresentationWithRegistryVerificationResult,
  VerifyPresentationWithRegistryParams,
} from "@mintra/verifier-core";

export function verifyPresentationWithRegistry(
  params: VerifyPresentationWithRegistryParams
): Promise<PresentationWithRegistryVerificationResult> {
  return verifyPresentationWithRegistryCore(params);
}

export type {
  PresentationWithRegistryVerificationResult,
  VerifyPresentationWithRegistryParams,
} from "@mintra/verifier-core";
