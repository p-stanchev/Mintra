import { createMintraClient } from "@mintra/sdk-js";
import { readAuthToken } from "./wallet-session";

export const mintra = createMintraClient({
  apiBaseUrl: process.env["NEXT_PUBLIC_MINTRA_API_URL"] ?? "http://localhost:3001",
  authTokenProvider: () => readAuthToken(),
});
