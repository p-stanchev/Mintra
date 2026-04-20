let cachedPresentationTools:
  | Promise<{
      Credential: typeof import("mina-attestations").Credential;
      Operation: typeof import("mina-attestations").Operation;
      Presentation: typeof import("mina-attestations").Presentation;
      PresentationRequest: typeof import("mina-attestations").PresentationRequest;
      PresentationSpec: typeof import("mina-attestations").PresentationSpec;
      Field: typeof import("o1js").Field;
    }>
  | undefined;

export const DEFAULT_AGE_PROOF_ACTION = "mintra:protected-access";

export type AgeOver18PresentationRequest = unknown;
export type SerializedPresentationRequest = Record<string, unknown>;

export interface VerifiedAgeOver18Presentation {
  ageOver18: boolean;
  ownerPublicKey: string;
}

export interface VerifyAgeOver18PresentationParams {
  request: AgeOver18PresentationRequest;
  presentationJson: string;
  verifierIdentity: string;
}

export function warmUpPresentationTools() {
  void loadPresentationTools();
}

async function loadPresentationTools() {
  cachedPresentationTools ??= Promise.all([
    import("mina-attestations"),
    import("o1js"),
  ]).then(([attestations, o1js]) => ({
    Credential: attestations.Credential,
    Operation: attestations.Operation,
    Presentation: attestations.Presentation,
    PresentationRequest: attestations.PresentationRequest,
    PresentationSpec: attestations.PresentationSpec,
    Field: o1js.Field,
  }));

  return cachedPresentationTools;
}

export async function buildAgeOver18PresentationRequest(
  action = DEFAULT_AGE_PROOF_ACTION
): Promise<AgeOver18PresentationRequest> {
  const {
    Credential,
    Operation,
    PresentationRequest,
    PresentationSpec,
    Field,
  } = await loadPresentationTools();

  const credential = Credential.Native({
    ageOver18: Field,
    kycPassed: Field,
    countryCode: Field,
    issuedAt: Field,
  });

  const spec = PresentationSpec(
    { credential },
    // mina-attestations infers this at runtime; dts generation needs an explicit escape hatch here.
    ({ credential }: { credential: any }) => ({
    assert: [
      Operation.equals(
        Operation.property(credential, "ageOver18"),
        Operation.constant(Field(1))
      ),
      Operation.equals(
        Operation.property(credential, "kycPassed"),
        Operation.constant(Field(1))
      ),
    ],
    outputClaim: Operation.record({
      ageOver18: Operation.property(credential, "ageOver18"),
      owner: Operation.owner,
    }),
    })
  );

  return PresentationRequest.https(spec, {}, { action }) as AgeOver18PresentationRequest;
}

export async function serializePresentationRequest(
  request: AgeOver18PresentationRequest
): Promise<SerializedPresentationRequest> {
  const { PresentationRequest } = await loadPresentationTools();
  return JSON.parse(
    // The public API intentionally hides the concrete mina-attestations request type.
    PresentationRequest.toJSON(request as any)
  ) as SerializedPresentationRequest;
}

export async function parsePresentationRequest(
  presentationRequestJson: string
): Promise<AgeOver18PresentationRequest> {
  const { PresentationRequest } = await loadPresentationTools();
  return PresentationRequest.fromJSON(
    "https",
    presentationRequestJson
  ) as AgeOver18PresentationRequest;
}

/** @deprecated Use parsePresentationRequest */
export const parseHttpsPresentationRequest = parsePresentationRequest;

export async function verifyAgeOver18Presentation(
  params: VerifyAgeOver18PresentationParams
): Promise<VerifiedAgeOver18Presentation> {
  const { Presentation } = await loadPresentationTools();
  const presentation = Presentation.fromJSON(params.presentationJson);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const verified = await (Presentation.verify as any)(
    params.request,
    presentation,
    { verifierIdentity: params.verifierIdentity }
  );

  return {
    ageOver18: verified.ageOver18.toString() === "1",
    ownerPublicKey: verified.owner.toBase58(),
  };
}
