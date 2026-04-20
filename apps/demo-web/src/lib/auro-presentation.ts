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

export const DEFAULT_AGE_PROOF_ACTION = "mintra:protected-access";

export async function buildAgeOver18PresentationRequest(
  action = DEFAULT_AGE_PROOF_ACTION
) {
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

  const spec = PresentationSpec({ credential }, ({ credential }) => ({
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
    outputClaim: Operation.property(credential, "ageOver18"),
  }));

  return PresentationRequest.https(spec, {}, { action });
}

export async function verifyAgeOver18Presentation(params: {
  request: Awaited<ReturnType<typeof buildAgeOver18PresentationRequest>>;
  presentationJson: string;
  verifierIdentity: string;
}) {
  const { Presentation } = await loadPresentationTools();
  const presentation = Presentation.fromJSON(params.presentationJson);

  await Presentation.verify(params.request, presentation, {
    verifierIdentity: params.verifierIdentity,
  });

  return true;
}
