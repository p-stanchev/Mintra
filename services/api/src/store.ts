import { v4 as uuidv4 } from "uuid";

export type VerificationStatus =
  | "not_started"
  | "pending"
  | "approved"
  | "rejected"
  | "needs_review"
  | "error";

export interface VerificationRecord {
  id: string;
  userId: string;
  provider: "didit";
  status: VerificationStatus;
  providerReference: string; // Didit session_id
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimsRecord {
  userId: string;
  verificationId: string;
  ageOver18: boolean | null;
  kycPassed: boolean | null;
  countryCode: string | null;
  verifiedAt: Date;
}

export class InMemoryStore {
  // keyed by internal UUID
  private verifications = new Map<string, VerificationRecord>();
  // keyed by Didit session_id for fast webhook lookup
  private byProviderRef = new Map<string, string>();
  // keyed by userId
  private claims = new Map<string, ClaimsRecord>();

  createVerification(userId: string, sessionId: string): VerificationRecord {
    const id = uuidv4();
    const now = new Date();
    const record: VerificationRecord = {
      id,
      userId,
      provider: "didit",
      status: "not_started",
      providerReference: sessionId,
      createdAt: now,
      updatedAt: now,
    };
    this.verifications.set(id, record);
    this.byProviderRef.set(sessionId, id);
    return record;
  }

  getVerification(id: string): VerificationRecord | undefined {
    return this.verifications.get(id);
  }

  getVerificationByProviderRef(sessionId: string): VerificationRecord | undefined {
    const id = this.byProviderRef.get(sessionId);
    return id ? this.verifications.get(id) : undefined;
  }

  updateVerificationStatus(sessionId: string, status: VerificationStatus): VerificationRecord | undefined {
    const id = this.byProviderRef.get(sessionId);
    if (!id) return undefined;
    const record = this.verifications.get(id);
    if (!record) return undefined;
    record.status = status;
    record.updatedAt = new Date();
    return record;
  }

  upsertClaims(
    userId: string,
    verificationId: string,
    data: { ageOver18?: boolean; kycPassed?: boolean; countryCode?: string }
  ): void {
    this.claims.set(userId, {
      userId,
      verificationId,
      ageOver18: data.ageOver18 ?? null,
      kycPassed: data.kycPassed ?? null,
      countryCode: data.countryCode ?? null,
      verifiedAt: new Date(),
    });
  }

  getClaims(userId: string): ClaimsRecord | undefined {
    return this.claims.get(userId);
  }
}
