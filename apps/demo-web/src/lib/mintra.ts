import { createMintraClient } from "@mintra/sdk-js";

export const mintra = createMintraClient({
  apiBaseUrl: process.env["NEXT_PUBLIC_MINTRA_API_URL"] ?? "http://localhost:3001",
});

export const DEMO_USER_ID =
  process.env["NEXT_PUBLIC_DEMO_USER_ID"] ?? "demo-user-001";
