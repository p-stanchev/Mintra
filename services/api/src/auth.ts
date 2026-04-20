import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createRequire } from "node:module";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const FRESH_AUTH_WINDOW_MS = 10 * 60 * 1000;
const MAX_CHALLENGES = 1_000;
const MAX_SESSIONS = 5_000;
const MINA_PUBKEY_RE = /^B62[1-9A-HJ-NP-Za-km-z]{50,54}$/;

type SignedMessageInput = {
  publicKey: string;
  data: string;
  signature: {
    field: string;
    scalar: string;
  };
};

type ChallengeRecord = {
  id: string;
  walletAddress: string;
  message: string;
  origin: string;
  expiresAt: number;
};

type SessionRecord = {
  token: string;
  walletAddress: string;
  createdAt: number;
  expiresAt: number;
};

type MinaSignerClient = {
  verifyMessage(input: SignedMessageInput): boolean;
};

const nodeRequire = createRequire(__filename);
const MinaSigner = nodeRequire("mina-signer");

export class WalletAuthStore {
  private readonly signers: MinaSignerClient[];
  private readonly challenges = new Map<string, ChallengeRecord>();
  private readonly sessions = new Map<string, SessionRecord>();

  constructor() {
    this.signers = [
      new MinaSigner({ network: "mainnet" }),
      new MinaSigner({ network: "testnet" }),
    ];
  }

  createChallenge(walletAddress: string, origin: string): ChallengeRecord {
    if (!MINA_PUBKEY_RE.test(walletAddress)) {
      throw new Error("Invalid Mina public key");
    }

    this.evictExpired();
    this.evictOverflow(this.challenges, MAX_CHALLENGES);

    const id = randomUUID();
    const nonce = randomBytes(16).toString("hex");
    const issuedAt = Date.now();
    const expiresAt = issuedAt + CHALLENGE_TTL_MS;
    const normalizedOrigin = origin.trim();
    const message = [
      "Mintra wallet sign-in",
      "",
      "Sign this message to prove control of your Mina wallet for Mintra.",
      "This will not trigger a blockchain transaction or cost any gas fees.",
      "",
      `origin: ${normalizedOrigin}`,
      `address: ${walletAddress}`,
      `challenge_id: ${id}`,
      `nonce: ${nonce}`,
      `iat: ${issuedAt}`,
      `exp: ${expiresAt}`,
    ].join("\n");

    const record: ChallengeRecord = { id, walletAddress, message, origin: normalizedOrigin, expiresAt };
    this.challenges.set(id, record);
    return record;
  }

  verifySignedChallenge(input: {
    challengeId: string;
    publicKey: string;
    data: string;
    signature: { field: string; scalar: string };
    origin: string;
  }): { token: string; walletAddress: string; expiresAt: number } {
    this.evictExpired();

    const challenge = this.challenges.get(input.challengeId);
    if (!challenge) {
      throw new Error("Challenge not found or expired");
    }

    this.challenges.delete(input.challengeId);

    if (challenge.walletAddress !== input.publicKey) {
      throw new Error("Signed public key does not match the requested wallet");
    }

    if (input.data !== challenge.message) {
      throw new Error("Signed message does not match the issued challenge");
    }

    if (challenge.origin !== input.origin) {
      throw new Error("Signed origin does not match the issued challenge");
    }

    const verified = this.signers.some((signer) =>
      signer.verifyMessage({
        data: input.data,
        publicKey: input.publicKey,
        signature: input.signature,
      })
    );

    if (!verified) {
      throw new Error("Wallet signature verification failed");
    }

    return this.createSession(input.publicKey);
  }

  getWalletForToken(token: string): string | null {
    const session = this.getSession(token);
    return session?.walletAddress ?? null;
  }

  getSession(token: string): SessionRecord | null {
    this.evictExpired();
    const session = this.sessions.get(token);
    if (!session) return null;
    return session;
  }

  isFreshSession(token: string): boolean {
    const session = this.getSession(token);
    if (!session) return false;
    return Date.now() - session.createdAt <= FRESH_AUTH_WINDOW_MS;
  }

  revokeSession(token: string): void {
    this.sessions.delete(token);
  }

  close(): void {
    this.challenges.clear();
    this.sessions.clear();
  }

  createSession(walletAddress: string): { token: string; walletAddress: string; expiresAt: number } {
    if (!MINA_PUBKEY_RE.test(walletAddress)) {
      throw new Error("Invalid Mina public key");
    }

    this.evictExpired();
    this.evictOverflow(this.sessions, MAX_SESSIONS);
    const token = randomBytes(32).toString("base64url");
    const createdAt = Date.now();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    this.sessions.set(token, { token, walletAddress, createdAt, expiresAt });
    return { token, walletAddress, expiresAt };
  }

  private evictExpired(): void {
    const now = Date.now();

    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAt <= now) {
        this.challenges.delete(id);
      }
    }

    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }

  private evictOverflow<T>(map: Map<string, T>, maxSize: number): void {
    if (map.size < maxSize) return;
    const toDelete = Math.max(1, Math.floor(maxSize * 0.1));
    let deleted = 0;
    for (const key of map.keys()) {
      map.delete(key);
      deleted += 1;
      if (deleted >= toDelete) break;
    }
  }
}

export function readBearerToken(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim();
}

export function requireFreshWalletAuth(
  request: FastifyRequest,
  reply: FastifyReply
): string | null {
  const authWallet = requireWalletAuth(request, reply);
  if (!authWallet) return null;
  if (!request.authWalletIsFresh) {
    reply.status(401).send({ error: "Reauthenticate wallet before credential issuance" });
    return null;
  }
  return authWallet;
}

export function requireWalletAuth(
  request: FastifyRequest,
  reply: FastifyReply
): string | null {
  if (!request.authWalletAddress) {
    reply.status(401).send({ error: "Wallet authentication required" });
    return null;
  }
  return request.authWalletAddress;
}

export function isValidMinaPublicKey(value: string): boolean {
  return MINA_PUBKEY_RE.test(value);
}

export function readTrustedOrigin(request: FastifyRequest, allowedOrigins: string[]): string | null {
  const origin = request.headers.origin;
  if (typeof origin !== "string") return null;
  const normalizedOrigin = origin.trim();
  if (!normalizedOrigin) return null;
  if (!allowedOrigins.includes(normalizedOrigin)) return null;
  return normalizedOrigin;
}
