import { v4 as uuidv4 } from "uuid";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ClaimModelVersion, DerivedClaims, SourceCommitments } from "@mintra/sdk-types";

const MAX_VERIFICATIONS = 10_000;
const MAX_CLAIMS = 10_000;
const MAX_PROCESSED_WEBHOOKS = 50_000;
const CLAIM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
  ageOver21: boolean | null;
  kycPassed: boolean | null;
  countryCode: string | null;
  claimModelVersion: ClaimModelVersion;
  derivedClaims?: DerivedClaims;
  sourceCommitments?: SourceCommitments;
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
    data: {
      ageOver18?: boolean;
      ageOver21?: boolean;
      kycPassed?: boolean;
      countryCode?: string;
      claimModelVersion?: ClaimModelVersion;
      derivedClaims?: DerivedClaims;
      sourceCommitments?: SourceCommitments;
    }
  ): Promise<void>;
  getClaims(userId: string): Promise<ClaimsRecord | undefined>;
  isWebhookProcessed(key: string): boolean;
  markWebhookProcessed(key: string): void;
  close(): Promise<void>;
}

interface PersistedState {
  verifications: Array<VerificationRecord>;
  claims: Array<ClaimsRecord>;
  processedWebhooks: string[];
}

export class InMemoryStore implements VerificationStore {
  private verifications = new Map<string, VerificationRecord>();
  private byProviderRef = new Map<string, string>();
  private claims = new Map<string, ClaimsRecord>();
  private processedWebhooks = new Set<string>();
  private readonly stateFile: string | null;
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(stateFile: string | null = null) {
    this.stateFile = stateFile;
  }

  async createVerification(userId: string, sessionId: string): Promise<VerificationRecord> {
    if (this.verifications.size >= MAX_VERIFICATIONS) {
      throw new Error("Verification store capacity exceeded");
    }
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
    this.schedulePersist();
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
    this.schedulePersist();
    return record;
  }

  async upsertClaims(
    userId: string,
    verificationId: string,
    data: {
      ageOver18?: boolean;
      ageOver21?: boolean;
      kycPassed?: boolean;
      countryCode?: string;
      claimModelVersion?: ClaimModelVersion;
      derivedClaims?: DerivedClaims;
      sourceCommitments?: SourceCommitments;
    }
  ): Promise<void> {
    if (!this.claims.has(userId) && this.claims.size >= MAX_CLAIMS) {
      throw new Error("Claims store capacity exceeded");
    }
    this.claims.set(userId, {
      userId,
      verificationId,
      ageOver18: data.ageOver18 ?? null,
      ageOver21: data.ageOver21 ?? null,
      kycPassed: data.kycPassed ?? null,
      countryCode: data.countryCode ?? null,
      claimModelVersion: data.claimModelVersion ?? "v1",
      ...(data.derivedClaims === undefined ? {} : { derivedClaims: data.derivedClaims }),
      ...(data.sourceCommitments === undefined ? {} : { sourceCommitments: data.sourceCommitments }),
      verifiedAt: new Date(),
    });
    this.schedulePersist();
  }

  async getClaims(userId: string): Promise<ClaimsRecord | undefined> {
    const claim = this.claims.get(userId);
    if (!claim) return undefined;
    if (isClaimExpired(claim)) {
      this.claims.delete(userId);
      this.schedulePersist();
      return undefined;
    }
    return claim;
  }

  isWebhookProcessed(key: string): boolean {
    return this.processedWebhooks.has(key);
  }

  markWebhookProcessed(key: string): void {
    if (this.processedWebhooks.size >= MAX_PROCESSED_WEBHOOKS) {
      // Evict oldest 10% when full — Set preserves insertion order
      const toDelete = Math.floor(MAX_PROCESSED_WEBHOOKS * 0.1);
      let deleted = 0;
      for (const k of this.processedWebhooks) {
        this.processedWebhooks.delete(k);
        if (++deleted >= toDelete) break;
      }
    }
    this.processedWebhooks.add(key);
    this.schedulePersist();
  }

  async close(): Promise<void> {
    await this.flushPromise;
  }

  async hydrate(): Promise<void> {
    if (!this.stateFile) return;

    try {
      const raw = await fs.readFile(this.stateFile, "utf8");
      const parsed = JSON.parse(raw) as PersistedState;

      this.verifications.clear();
      this.byProviderRef.clear();
      this.claims.clear();
      this.processedWebhooks.clear();

      for (const record of parsed.verifications ?? []) {
        const hydrated: VerificationRecord = {
          ...record,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
        };
        this.verifications.set(hydrated.id, hydrated);
        this.byProviderRef.set(hydrated.providerReference, hydrated.id);
      }

      for (const claim of parsed.claims ?? []) {
        const hydratedClaim: ClaimsRecord = {
          ...claim,
          ageOver21: "ageOver21" in claim ? claim.ageOver21 : null,
          claimModelVersion: "claimModelVersion" in claim ? claim.claimModelVersion : "v1",
          ...(claim.derivedClaims === undefined ? {} : { derivedClaims: claim.derivedClaims }),
          ...(claim.sourceCommitments === undefined ? {} : { sourceCommitments: claim.sourceCommitments }),
          verifiedAt: new Date(claim.verifiedAt),
        };
        if (!isClaimExpired(hydratedClaim)) {
          this.claims.set(hydratedClaim.userId, hydratedClaim);
        }
      }

      for (const key of parsed.processedWebhooks ?? []) {
        this.processedWebhooks.add(key);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }

  private schedulePersist(): void {
    if (!this.stateFile) return;

    this.flushPromise = this.flushPromise
      .then(() => this.persist())
      .catch(() => this.persist());
  }

  private async persist(): Promise<void> {
    if (!this.stateFile) return;

    const dir = path.dirname(this.stateFile);
    await fs.mkdir(dir, { recursive: true });

    const state: PersistedState = {
      verifications: Array.from(this.verifications.values()),
      claims: Array.from(this.claims.values()),
      processedWebhooks: Array.from(this.processedWebhooks.values()),
    };

    const tempFile = `${this.stateFile}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    await fs.rename(tempFile, this.stateFile);
  }
}

function isClaimExpired(claim: ClaimsRecord): boolean {
  return Date.now() - claim.verifiedAt.getTime() > CLAIM_TTL_MS;
}

export async function createStore(stateFile?: string | false): Promise<VerificationStore> {
  const resolvedStateFile =
    stateFile === false
      ? null
      : stateFile ??
        (process.env["NODE_ENV"] === "test"
          ? null
          : path.resolve(process.cwd(), process.env["MINTRA_STATE_FILE"] ?? ".mintra", "state.json"));

  const store = new InMemoryStore(resolvedStateFile);
  await store.hydrate();
  return store;
}
