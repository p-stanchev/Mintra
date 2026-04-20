import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json" with { type: "json" };

countries.registerLocale(enLocale);

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

export interface VerifierPolicy {
  minAge?: 18 | 21;
  requireKycPassed?: boolean;
  countryAllowlist?: string[];
  countryBlocklist?: string[];
  maxCredentialAgeDays?: number;
}

export interface NormalizedVerifierPolicy {
  minAge: 18 | 21;
  requireKycPassed: boolean;
  countryAllowlist: string[];
  countryBlocklist: string[];
  maxCredentialAgeDays: number | null;
}

export interface VerifiedPresentationOutput {
  ageOver18: boolean;
  ageOver21: boolean;
  kycPassed: boolean;
  countryCodeNumeric: number;
  issuedAt: number;
  ownerPublicKey: string;
}

export interface VerifyPresentationParams {
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

export function normalizeVerifierPolicy(policy?: VerifierPolicy): NormalizedVerifierPolicy {
  const minAge = policy?.minAge === 21 ? 21 : 18;
  const requireKycPassed = policy?.requireKycPassed !== false;
  const countryAllowlist = normalizeCountryList(policy?.countryAllowlist);
  const countryBlocklist = normalizeCountryList(policy?.countryBlocklist);
  const maxCredentialAgeDays = normalizeMaxCredentialAgeDays(policy?.maxCredentialAgeDays);

  return {
    minAge,
    requireKycPassed,
    countryAllowlist,
    countryBlocklist,
    maxCredentialAgeDays,
  };
}

export async function buildPresentationRequest(
  policy?: VerifierPolicy,
  action = DEFAULT_AGE_PROOF_ACTION
): Promise<AgeOver18PresentationRequest> {
  const {
    Credential,
    Operation,
    PresentationRequest,
    PresentationSpec,
    Field,
  } = await loadPresentationTools();

  const normalizedPolicy = normalizeVerifierPolicy(policy);

  const credentialShape: Record<string, typeof Field> = {
    ageOver18: Field,
    kycPassed: Field,
    countryCode: Field,
    issuedAt: Field,
  };
  if (normalizedPolicy.minAge === 21) {
    credentialShape["ageOver21"] = Field;
  }

  const credential = Credential.Native(credentialShape);

  const spec = PresentationSpec(
    { credential },
    ({ credential }: { credential: any }) => {
      const assertions = [];

      if (normalizedPolicy.minAge === 21) {
        assertions.push(
          Operation.equals(
            Operation.property(credential, "ageOver21"),
            Operation.constant(Field(1))
          )
        );
      } else if (normalizedPolicy.minAge === 18) {
        assertions.push(
          Operation.equals(
            Operation.property(credential, "ageOver18"),
            Operation.constant(Field(1))
          )
        );
      }

      if (normalizedPolicy.requireKycPassed) {
        assertions.push(
          Operation.equals(
            Operation.property(credential, "kycPassed"),
            Operation.constant(Field(1))
          )
        );
      }

      if (normalizedPolicy.countryAllowlist.length > 0) {
        assertions.push(
          Operation.equalsOneOf(
            Operation.property(credential, "countryCode"),
            normalizedPolicy.countryAllowlist.map((code) =>
              Operation.constant(Field(alpha2ToNumeric(code)))
            )
          )
        );
      }

      if (normalizedPolicy.countryBlocklist.length > 0) {
        assertions.push(
          Operation.not(
            Operation.equalsOneOf(
              Operation.property(credential, "countryCode"),
              normalizedPolicy.countryBlocklist.map((code) =>
                Operation.constant(Field(alpha2ToNumeric(code)))
              )
            )
          )
        );
      }

      if (normalizedPolicy.maxCredentialAgeDays !== null) {
        const minIssuedAt = Math.floor(Date.now() / 1000) - normalizedPolicy.maxCredentialAgeDays * 24 * 60 * 60;
        assertions.push(
          Operation.lessThanEq(
            Operation.constant(Field(minIssuedAt)),
            Operation.property(credential, "issuedAt")
          )
        );
      }

      return {
        assert: assertions,
        outputClaim: Operation.record({
          ageOver18: Operation.property(credential, "ageOver18"),
          ageOver21:
            normalizedPolicy.minAge === 21
              ? Operation.property(credential, "ageOver21")
              : Operation.constant(Field(0)),
          kycPassed: Operation.property(credential, "kycPassed"),
          countryCode: Operation.property(credential, "countryCode"),
          issuedAt: Operation.property(credential, "issuedAt"),
          owner: Operation.owner,
        }),
      };
    }
  );

  return PresentationRequest.https(spec, {}, { action }) as AgeOver18PresentationRequest;
}

export async function buildAgeOver18PresentationRequest(
  action = DEFAULT_AGE_PROOF_ACTION
): Promise<AgeOver18PresentationRequest> {
  return buildPresentationRequest({ minAge: 18, requireKycPassed: true }, action);
}

export async function serializePresentationRequest(
  request: AgeOver18PresentationRequest
): Promise<SerializedPresentationRequest> {
  const { PresentationRequest } = await loadPresentationTools();
  return JSON.parse(
    PresentationRequest.toJSON(request as any)
  ) as SerializedPresentationRequest;
}

export async function parsePresentationRequest(
  presentationRequestJson: string
): Promise<AgeOver18PresentationRequest> {
  const { PresentationRequest } = await loadPresentationTools();
  return PresentationRequest.fromJSON("https", presentationRequestJson) as AgeOver18PresentationRequest;
}

/** @deprecated Use parsePresentationRequest */
export const parseHttpsPresentationRequest = parsePresentationRequest;

export async function verifyPresentationPolicy(
  params: VerifyPresentationParams
): Promise<VerifiedPresentationOutput> {
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
    ageOver21: verified.ageOver21.toString() === "1",
    kycPassed: verified.kycPassed.toString() === "1",
    countryCodeNumeric: Number(verified.countryCode.toString()),
    issuedAt: Number(verified.issuedAt.toString()),
    ownerPublicKey: verified.owner.toBase58(),
  };
}

export async function verifyAgeOver18Presentation(
  params: VerifyPresentationParams
): Promise<VerifiedPresentationOutput> {
  return verifyPresentationPolicy(params);
}

function normalizeCountryList(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const seen = new Set<string>();
  for (const value of values) {
    const code = normalizeCountryToIso2(value);
    if (code) seen.add(code);
  }
  return Array.from(seen);
}

function normalizeCountryToIso2(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const normalized = trimmed.toUpperCase();
  if (!normalized) return undefined;
  if (normalized.length === 2) return normalized;

  if (/^\d+$/.test(normalized)) {
    const byNumeric = countries.numericToAlpha2(normalized.padStart(3, "0"));
    if (byNumeric) return byNumeric;
  }

  const alpha3 = countries.alpha3ToAlpha2(normalized);
  if (alpha3) return alpha3;

  const byName = countries.getAlpha2Code(trimmed, "en");
  if (byName) return byName;

  return undefined;
}

function alpha2ToNumeric(alpha2: string): number {
  return Number(countries.alpha2ToNumeric(alpha2) ?? 0);
}

function normalizeMaxCredentialAgeDays(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  if (normalized <= 0) return null;
  return normalized;
}
