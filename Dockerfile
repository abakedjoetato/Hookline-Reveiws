# syntax=docker/dockerfile:1.7
#
# One Dockerfile, four images (pick with --target):
#   api      NestJS API (port 4000)
#   worker   BullMQ media worker (health on 4001)
#   web      Next.js site, standalone server (port 3000)
#   migrate  one-shot: applies migrations and runs the idempotent seed
#
# Example: docker build --target api -t thequeue-api .

ARG NODE_VERSION=22-bookworm-slim

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
# openssl: Prisma schema engine (migrations); ca-certificates: Stripe/S3/SMTP TLS
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/api-client/package.json packages/api-client/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/logger/package.json packages/logger/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/validation/package.json packages/validation/
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
# Baked into the browser bundle at build time
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_WS_URL="/"
# Fallback proxy target for /api when no reverse proxy is in front (build-time)
ARG API_INTERNAL_URL="http://api:4000"
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    API_INTERNAL_URL=$API_INTERNAL_URL
RUN mkdir -p apps/api/node_modules apps/worker/node_modules \
  && npm run build:packages \
  && npm run build -w apps/api \
  && npm run build -w apps/worker \
  && npm run build -w apps/web

# ---------------------------------------------------------------------------
FROM base AS server-runtime
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]

FROM server-runtime AS api
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]

FROM server-runtime AS worker
COPY --from=build --chown=node:node /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=node:node /app/apps/worker/node_modules ./apps/worker/node_modules
EXPOSE 4001
CMD ["node", "apps/worker/dist/index.js"]

FROM server-runtime AS migrate
WORKDIR /app/packages/database
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts"]

# ---------------------------------------------------------------------------
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
