import { createApiClient } from "@platform/api-client";

/**
 * All requests go to same-origin /api/v1, which is proxied to the API
 * (reverse proxy in production, Next rewrites in development).
 */
export const api = createApiClient({ baseURL: "/api/v1" });
