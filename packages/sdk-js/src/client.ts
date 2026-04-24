import type {
  StartVerificationRequest,
  StartVerificationResponse,
  GetStatusResponse,
  GetClaimsResponse,
  CreateWalletAuthChallengeRequest,
  CreateWalletAuthChallengeResponse,
  VerifyWalletAuthRequest,
  VerifyWalletAuthResponse,
  IssueMinaCredentialRequest,
  IssueMinaCredentialResponse,
  GetZkProofInputResponse,
  GetZkAgeProofInputResponse,
  IssueDemoClaimsRequest,
  IssueDemoClaimsResponse,
} from "@mintra/sdk-types";
import {
  StartVerificationResponseSchema,
  GetStatusResponseSchema,
  GetClaimsResponseSchema,
  CreateWalletAuthChallengeResponseSchema,
  VerifyWalletAuthResponseSchema,
  IssueMinaCredentialResponseSchema,
  GetZkProofInputResponseSchema,
  GetZkAgeProofInputResponseSchema,
  IssueDemoClaimsResponseSchema,
} from "@mintra/sdk-types";
import type { ZodSchema } from "./types";

export interface MintraClientConfig {
  apiBaseUrl: string;
  apiKey?: string;
  authToken?: string;
  authTokenProvider?: () => string | null | undefined;
}

async function request<T>(
  baseUrl: string,
  path: string,
  options: RequestInit,
  schema: ZodSchema<T>,
  apiKey?: string,
  authToken?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined ?? {}) },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mintra API error ${response.status}: ${body}`);
  }

  const json: unknown = await response.json();
  return schema.parse(json);
}

export function createMintraClient(config: MintraClientConfig) {
  const baseUrl = config.apiBaseUrl.replace(/\/$/, "");
  const readAuthToken = () => config.authTokenProvider?.() ?? config.authToken ?? undefined;

  return {
    async startVerification(
      input: StartVerificationRequest
    ): Promise<StartVerificationResponse> {
      return request(
        baseUrl,
        "/api/verifications/start",
        { method: "POST", body: JSON.stringify(input) },
        StartVerificationResponseSchema,
        config.apiKey,
        readAuthToken()
      );
    },

    async getVerificationStatus(sessionId: string): Promise<GetStatusResponse> {
      return request(
        baseUrl,
        `/api/verifications/${sessionId}/status`,
        { method: "GET" },
        GetStatusResponseSchema,
        config.apiKey,
        readAuthToken()
      );
    },

    async getClaims(userId: string): Promise<GetClaimsResponse> {
      return request(
        baseUrl,
        `/api/claims/${userId}`,
        { method: "GET" },
        GetClaimsResponseSchema,
        config.apiKey,
        readAuthToken()
      );
    },

    async createWalletAuthChallenge(
      input: CreateWalletAuthChallengeRequest
    ): Promise<CreateWalletAuthChallengeResponse> {
      return request(
        baseUrl,
        "/api/auth/challenge",
        { method: "POST", body: JSON.stringify(input) },
        CreateWalletAuthChallengeResponseSchema,
        config.apiKey,
        readAuthToken()
      );
    },

    async verifyWalletAuth(
      input: VerifyWalletAuthRequest
    ): Promise<VerifyWalletAuthResponse> {
      return request(
        baseUrl,
        "/api/auth/verify",
        { method: "POST", body: JSON.stringify(input) },
        VerifyWalletAuthResponseSchema,
        config.apiKey,
        readAuthToken()
      );
    },

    async logout(): Promise<void> {
      const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
          ...(readAuthToken() ? { authorization: `Bearer ${readAuthToken()}` } : {}),
        },
      });

      if (!response.ok && response.status !== 204) {
        const body = await response.text();
        throw new Error(`Mintra API error ${response.status}: ${body}`);
      }
    },

    async issueMinaCredential(
      input: IssueMinaCredentialRequest
    ): Promise<IssueMinaCredentialResponse> {
      return request(
        baseUrl,
        "/api/mina/issue-credential",
        { method: "POST", body: JSON.stringify(input) },
        IssueMinaCredentialResponseSchema,
        config.apiKey,
        readAuthToken()
      );
    },

    async issueDemoClaims(
      input: IssueDemoClaimsRequest
    ): Promise<IssueDemoClaimsResponse> {
      return request(
        baseUrl,
        "/api/demo/issue-claims",
        { method: "POST", body: JSON.stringify(input) },
        IssueDemoClaimsResponseSchema,
        config.apiKey,
        readAuthToken()
      );
    },

    async getZkAgeProofInput(userId: string): Promise<GetZkAgeProofInputResponse> {
      return request(
        baseUrl,
        `/api/mina/zk-age-proof-input/${userId}`,
        { method: "GET" },
        GetZkAgeProofInputResponseSchema,
        config.apiKey,
        readAuthToken()
      );
    },

    async getZkProofInput(userId: string): Promise<GetZkProofInputResponse> {
      return request(
        baseUrl,
        `/api/mina/zk-age-proof-input/${userId}`,
        { method: "GET" },
        GetZkProofInputResponseSchema,
        config.apiKey,
        readAuthToken()
      );
    },
  };
}

export type MintraClient = ReturnType<typeof createMintraClient>;
