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
  providerReference: string;
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

export interface VerificationStore {
  createVerification(userId: string, sessionId: string): Promise<VerificationRecord>;
  getVerification(id: string): Promise<VerificationRecord | undefined>;
  getVerificationByProviderRef(sessionId: string): Promise<VerificationRecord | undefined>;
  updateVerificationStatus(sessionId: string, status: VerificationStatus): Promise<VerificationRecord | undefined>;
  upsertClaims(
    userId: string,
    verificationId: string,
    data: { ageOver18?: boolean; kycPassed?: boolean; countryCode?: string }
  ): Promise<void>;
  getClaims(userId: string): Promise<ClaimsRecord | undefined>;
  close(): Promise<void>;
}

export class InMemoryStore implements VerificationStore {
  private verifications = new Map<string, VerificationRecord>();
  private byProviderRef = new Map<string, string>();
  private claims = new Map<string, ClaimsRecord>();

  async createVerification(userId: string, sessionId: string): Promise<VerificationRecord> {
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

  async getVerification(id: string): Promise<VerificationRecord | undefined> {
    return this.verifications.get(id);
  }

  async getVerificationByProviderRef(sessionId: string): Promise<VerificationRecord | undefined> {
    const id = this.byProviderRef.get(sessionId);
    return id ? this.verifications.get(id) : undefined;
  }

  async updateVerificationStatus(sessionId: string, status: VerificationStatus): Promise<VerificationRecord | undefined> {
    const id = this.byProviderRef.get(sessionId);
    if (!id) return undefined;
    const record = this.verifications.get(id);
    if (!record) return undefined;
    record.status = status;
    record.updatedAt = new Date();
    return record;
  }

  async upsertClaims(
    userId: string,
    verificationId: string,
    data: { ageOver18?: boolean; kycPassed?: boolean; countryCode?: string }
  ): Promise<void> {
    this.claims.set(userId, {
      userId,
      verificationId,
      ageOver18: data.ageOver18 ?? null,
      kycPassed: data.kycPassed ?? null,
      countryCode: data.countryCode ?? null,
      verifiedAt: new Date(),
    });
  }

  async getClaims(userId: string): Promise<ClaimsRecord | undefined> {
    return this.claims.get(userId);
  }

  async close(): Promise<void> {
    return;
  }
}

export async function createStore(): Promise<VerificationStore> {
  return new InMemoryStore();
}
