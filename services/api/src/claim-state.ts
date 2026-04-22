import type { NormalizedClaims } from "@mintra/sdk-types";
import type { ClaimsRecord } from "./store";

const CLAIM_FRESHNESS_DAYS = Number(process.env["MINTRA_CLAIM_FRESHNESS_DAYS"] ?? 365);
const CLAIM_EXPIRING_SOON_DAYS = Number(process.env["MINTRA_CLAIM_EXPIRING_SOON_DAYS"] ?? 30);

export function buildNormalizedClaims(claim: ClaimsRecord): NormalizedClaims {
  const normalized: NormalizedClaims = {};

  if (claim.dateOfBirth) {
    if (hasReachedAge(claim.dateOfBirth, 18)) normalized.age_over_18 = true;
    if (hasReachedAge(claim.dateOfBirth, 21)) normalized.age_over_21 = true;
  } else {
    if (claim.ageOver18 !== null) normalized.age_over_18 = claim.ageOver18;
    if (claim.ageOver21 !== null) normalized.age_over_21 = claim.ageOver21;
  }

  if (claim.kycPassed !== null) normalized.kyc_passed = claim.kycPassed;
  if (claim.countryCode !== null) normalized.country_code = claim.countryCode;
  if (claim.nationality) normalized.nationality = claim.nationality;
  if (claim.documentExpiresAt) normalized.document_expires_at = claim.documentExpiresAt.toISOString();

  return normalized;
}

export function buildClaimFreshness(claim: ClaimsRecord): {
  verifiedAt: string;
  expiresAt: string;
  freshnessStatus: "verified" | "expiring_soon" | "expired";
  documentExpiresAt: string | null;
} {
  const policyExpiresAt = new Date(
    claim.verifiedAt.getTime() + CLAIM_FRESHNESS_DAYS * 24 * 60 * 60 * 1000
  );
  const documentExpiresAt = claim.documentExpiresAt
    ? endOfDayUtc(claim.documentExpiresAt)
    : null;

  const effectiveExpiresAt =
    documentExpiresAt && documentExpiresAt.getTime() < policyExpiresAt.getTime()
      ? documentExpiresAt
      : policyExpiresAt;

  const now = Date.now();
  const expiringSoonAt =
    effectiveExpiresAt.getTime() - CLAIM_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;

  const freshnessStatus =
    now >= effectiveExpiresAt.getTime()
      ? "expired"
      : now >= expiringSoonAt
        ? "expiring_soon"
        : "verified";

  return {
    verifiedAt: claim.verifiedAt.toISOString(),
    expiresAt: effectiveExpiresAt.toISOString(),
    freshnessStatus,
    documentExpiresAt: documentExpiresAt?.toISOString() ?? null,
  };
}

function hasReachedAge(dateOfBirth: string, ageYears: number, now = new Date()): boolean {
  const dob = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(dob.getTime())) return false;

  const thresholdYear = now.getUTCFullYear() - ageYears;
  const thresholdMonth = now.getUTCMonth();
  const thresholdDay = now.getUTCDate();

  const dobYear = dob.getUTCFullYear();
  const dobMonth = dob.getUTCMonth();
  const dobDay = dob.getUTCDate();

  if (dobYear < thresholdYear) return true;
  if (dobYear > thresholdYear) return false;
  if (dobMonth < thresholdMonth) return true;
  if (dobMonth > thresholdMonth) return false;
  return dobDay <= thresholdDay;
}

function endOfDayUtc(date: Date): Date {
  const value = new Date(date);
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}
