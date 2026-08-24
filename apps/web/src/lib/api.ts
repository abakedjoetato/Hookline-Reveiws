import { createApiClient } from "@platform/api-client";

// In browser, this defaults to /api/v1 (proxied or direct) or explicit NEXT_PUBLIC_API_URL
const apiBaseUrl =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || "/api/v1"
    : process.env.API_URL || "http://127.0.0.1:3000/api/v1";

export const api = createApiClient({
  baseURL: apiBaseUrl,
});
