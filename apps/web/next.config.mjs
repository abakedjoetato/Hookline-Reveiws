/**
 * The browser always calls same-origin /api/v1/* (cookies stay first-party).
 * In production the reverse proxy (see infrastructure/docker/Caddyfile) sends
 * /api and /socket.io straight to the API. These rewrites cover local `next dev`
 * and any deployment without a proxy in front.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Development convenience: share the repo-root .env (Next only reads apps/web/.env*)
if (process.env.NODE_ENV !== "production") {
  try {
    process.loadEnvFile(path.join(here, "../../.env"));
  } catch {
    /* not present */
  }
}
const apiOrigin = process.env.API_INTERNAL_URL || "http://localhost:4000";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Trace dependencies from the monorepo root so workspace packages are bundled
  experimental: { outputFileTracingRoot: path.join(here, "../..") },
  poweredByHeader: false,
  transpilePackages: [
    "@platform/ui",
    "@platform/types",
    "@platform/config",
    "@platform/validation",
    "@platform/api-client",
  ],
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` },
      { source: "/socket.io/:path*", destination: `${apiOrigin}/socket.io/:path*` },
    ];
  },
  async headers() {
    const frameable = securityHeaders.filter((h) => h.key !== "X-Frame-Options");
    return [
      // Everything except the overlay may not be framed
      { source: "/((?!overlay/).*)", headers: securityHeaders },
      // The OBS overlay is loaded as a browser source, which may frame it
      { source: "/overlay/:path*", headers: frameable },
    ];
  },
};

export default nextConfig;
