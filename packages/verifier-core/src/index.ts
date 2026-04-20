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

export async function buildAgeOver18PresentationRequest() {
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

  return PresentationRequest.noContext(spec, {});
}

export async function serializePresentationRequest(
  request: Awaited<ReturnType<typeof buildAgeOver18PresentationRequest>>
) {
  const { PresentationRequest } = await loadPresentationTools();
  return JSON.parse(PresentationRequest.toJSON(request));
}

export async function parsePresentationRequest(presentationRequestJson: string) {
  const { PresentationRequest } = await loadPresentationTools();
  return PresentationRequest.fromJSON("no-context", presentationRequestJson);
}

/** @deprecated Use parsePresentationRequest */
export const parseHttpsPresentationRequest = parsePresentationRequest;

export async function verifyAgeOver18Presentation(params: {
  request: unknown;
  presentationJson: string;
}) {
  const { Presentation } = await loadPresentationTools();
  const presentation = Presentation.fromJSON(params.presentationJson);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Presentation.verify as any)(params.request, presentation);
}
