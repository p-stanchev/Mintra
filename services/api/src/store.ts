import { v4 as uuidv4 } from "uuid";
import mysql from "mysql2/promise";

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

const DEFAULT_TTL_HOURS = Number(process.env["VERIFICATION_TTL_HOURS"] ?? 24);

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function toVerificationRecord(row: {
  id: string;
  user_id: string;
  provider: string;
  status: VerificationStatus;
  provider_reference: string;
  created_at: Date | string;
  updated_at: Date | string;
}): VerificationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: "didit",
    status: row.status,
    providerReference: row.provider_reference,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toClaimsRecord(row: {
  user_id: string;
  verification_id: string;
  age_over_18: number | null;
  kyc_passed: number | null;
  country_code: string | null;
  verified_at: Date | string;
}): ClaimsRecord {
  return {
    userId: row.user_id,
    verificationId: row.verification_id,
    ageOver18: row.age_over_18 === null ? null : row.age_over_18 === 1,
    kycPassed: row.kyc_passed === null ? null : row.kyc_passed === 1,
    countryCode: row.country_code,
    verifiedAt: new Date(row.verified_at),
  };
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

export class MySqlStore implements VerificationStore {
  private constructor(
    private readonly pool: mysql.Pool,
    private readonly ttlHours: number
  ) {}

  static async create(): Promise<MySqlStore> {
    const pool = mysql.createPool(resolveMySqlConfig());
    const store = new MySqlStore(pool, DEFAULT_TTL_HOURS);
    await store.init();
    return store;
  }

  async createVerification(userId: string, sessionId: string): Promise<VerificationRecord> {
    await this.cleanupExpired();
    const id = uuidv4();
    const now = new Date();
    const expiresAt = addHours(now, this.ttlHours);

    await this.pool.execute(
      `INSERT INTO verifications
        (id, user_id, provider, status, provider_reference, created_at, updated_at, expires_at)
       VALUES (?, ?, 'didit', 'not_started', ?, ?, ?, ?)`,
      [id, userId, sessionId, now, now, expiresAt]
    );

    return {
      id,
      userId,
      provider: "didit",
      status: "not_started",
      providerReference: sessionId,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getVerification(id: string): Promise<VerificationRecord | undefined> {
    await this.cleanupExpired();
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, user_id, provider, status, provider_reference, created_at, updated_at
       FROM verifications
       WHERE id = ? AND expires_at > UTC_TIMESTAMP()`,
      [id]
    );
    const row = rows[0] as Parameters<typeof toVerificationRecord>[0] | undefined;
    return row ? toVerificationRecord(row) : undefined;
  }

  async getVerificationByProviderRef(sessionId: string): Promise<VerificationRecord | undefined> {
    await this.cleanupExpired();
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, user_id, provider, status, provider_reference, created_at, updated_at
       FROM verifications
       WHERE provider_reference = ? AND expires_at > UTC_TIMESTAMP()`,
      [sessionId]
    );
    const row = rows[0] as Parameters<typeof toVerificationRecord>[0] | undefined;
    return row ? toVerificationRecord(row) : undefined;
  }

  async updateVerificationStatus(sessionId: string, status: VerificationStatus): Promise<VerificationRecord | undefined> {
    await this.cleanupExpired();
    const now = new Date();
    const expiresAt = addHours(now, this.ttlHours);
    await this.pool.execute(
      `UPDATE verifications
       SET status = ?, updated_at = ?, expires_at = ?
       WHERE provider_reference = ? AND expires_at > UTC_TIMESTAMP()`,
      [status, now, expiresAt, sessionId]
    );
    return this.getVerificationByProviderRef(sessionId);
  }

  async upsertClaims(
    userId: string,
    verificationId: string,
    data: { ageOver18?: boolean; kycPassed?: boolean; countryCode?: string }
  ): Promise<void> {
    await this.cleanupExpired();
    const now = new Date();
    const expiresAt = addHours(now, this.ttlHours);

    await this.pool.execute(
      `INSERT INTO claims
        (user_id, verification_id, age_over_18, kyc_passed, country_code, verified_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        verification_id = VALUES(verification_id),
        age_over_18 = VALUES(age_over_18),
        kyc_passed = VALUES(kyc_passed),
        country_code = VALUES(country_code),
        verified_at = VALUES(verified_at),
        expires_at = VALUES(expires_at)`,
      [
        userId,
        verificationId,
        data.ageOver18 === undefined ? null : data.ageOver18 ? 1 : 0,
        data.kycPassed === undefined ? null : data.kycPassed ? 1 : 0,
        data.countryCode ?? null,
        now,
        expiresAt,
      ]
    );
  }

  async getClaims(userId: string): Promise<ClaimsRecord | undefined> {
    await this.cleanupExpired();
    const [rows] = await this.pool.execute<mysql.RowDataPacket[]>(
      `SELECT user_id, verification_id, age_over_18, kyc_passed, country_code, verified_at
       FROM claims
       WHERE user_id = ? AND expires_at > UTC_TIMESTAMP()`,
      [userId]
    );
    const row = rows[0] as Parameters<typeof toClaimsRecord>[0] | undefined;
    return row ? toClaimsRecord(row) : undefined;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async init(): Promise<void> {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS verifications (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        provider VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL,
        provider_reference VARCHAR(255) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        INDEX idx_verifications_expires_at (expires_at)
      )
    `);

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS claims (
        user_id VARCHAR(255) PRIMARY KEY,
        verification_id VARCHAR(36) NOT NULL,
        age_over_18 TINYINT NULL,
        kyc_passed TINYINT NULL,
        country_code VARCHAR(8) NULL,
        verified_at DATETIME NOT NULL,
        expires_at DATETIME NOT NULL,
        INDEX idx_claims_expires_at (expires_at)
      )
    `);
  }

  private async cleanupExpired(): Promise<void> {
    await this.pool.execute(`DELETE FROM claims WHERE expires_at <= UTC_TIMESTAMP()`);
    await this.pool.execute(`DELETE FROM verifications WHERE expires_at <= UTC_TIMESTAMP()`);
  }
}

export async function createStore(): Promise<VerificationStore> {
  if (hasMySqlConfig()) {
    return MySqlStore.create();
  }
  return new InMemoryStore();
}

function hasMySqlConfig(): boolean {
  return Boolean(
    process.env["DATABASE_URL"] ||
      process.env["MYSQL_URL"] ||
      (process.env["MYSQLHOST"] &&
        process.env["MYSQLUSER"] &&
        process.env["MYSQLPASSWORD"] &&
        process.env["MYSQLDATABASE"])
  );
}

function resolveMySqlConfig(): mysql.PoolOptions {
  const url =
    process.env["DATABASE_URL"]?.startsWith("mysql://") ? process.env["DATABASE_URL"] :
    process.env["MYSQL_URL"]?.startsWith("mysql://") ? process.env["MYSQL_URL"] :
    undefined;

  if (url) {
    return {
      uri: url,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false,
    };
  }

  const host = process.env["MYSQLHOST"];
  const user = process.env["MYSQLUSER"];
  const password = process.env["MYSQLPASSWORD"];
  const database = process.env["MYSQLDATABASE"];
  const port = Number(process.env["MYSQLPORT"] ?? 3306);

  if (!host || !user || !password || !database) {
    throw new Error("MySQL configuration is incomplete");
  }

  return {
    host,
    user,
    password,
    database,
    port,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
  };
}
