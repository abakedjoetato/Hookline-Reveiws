# Hookline Reviews (TheQueue)

A paid music-submission platform for livestreamers. Artists upload tracks and submit them to a host's live queue, for free or by paying for a priority tier. Hosts review submissions live on stream (TikTok, Twitch, YouTube, Kick, Facebook), show an OBS "now playing" overlay, and get paid through Stripe Connect.

## How it fits together

```text
Browser ──► Caddy (HTTPS) ──► /api/*, /socket.io/*  ──► api     NestJS, Postgres, Redis, Stripe
                          └─► everything else        ──► web     Next.js (all pages: artist, host, admin)
                                                         worker  BullMQ jobs (audio metadata, artwork, deletes)
Uploads/downloads use presigned URLs straight to S3-compatible storage (MinIO, AWS S3, R2).
```

| Path | What it is |
|---|---|
| `apps/api` | NestJS REST API under `/api/v1`, Socket.IO live-queue events, Stripe webhooks. The only service that touches the database. |
| `apps/web` | Next.js app with every page: public stations, artist library and submissions, host onboarding, studio and income, admin console, OBS overlay. Calls the API on the same origin. |
| `apps/worker` | Background jobs: reads audio duration/format after upload, processes artwork, deletes media. |
| `packages/database` | Prisma 7 schema, migrations, seed, and the shared `PrismaClient` (pg driver adapter). |
| `packages/types` | Shared request/response types (the contract between `web` and `api`). |
| `packages/validation` | Zod schemas for every request body and for environment variables. |
| `packages/api-client` | Typed client the web app uses for every API call. |
| `packages/{config,auth,logger,ui}` | Constants (payment split, play-count window), password hashing, logging, UI components. |

## Key business rules

- **Payment split:** 85% to the host's Stripe Connect account, 15% platform fee (Stripe fees come out of the 15%). `splitPayment()` in `@platform/config` is the single source of truth.
- **Priority tiers:** $2.00 minimum, $500 maximum, at most 10 active per station, fixed colour slots. Tiers are snapshotted when a host goes live, so edits never affect a broadcast in progress.
- **Play counting:** a track can be played any number of times, but a play only *counts* (Weekly Top 3, stats) after 120 s of continuous playback and at most once per track, per host, per 4 hours. Free and paid plays follow the same rule. See `docs/decisions/0028-play-counting-window.md`.
- **Host income:** each confirmed payment records a host earning. Hosts see income per broadcast, per year and in total at `/host/income` (net of refunds), with a link into their Stripe Express dashboard. The studio shows the current broadcast's earnings while live.

## Local development

Requirements: Node.js 20.12+ (22 recommended), npm 10, Docker (for Postgres, Redis, MinIO, Mailpit).

```bash
cp .env.example .env          # defaults match the local Docker services
npm install
npm run infrastructure:up     # Postgres, Redis, MinIO (+ private bucket), Mailpit
npm run db:deploy             # apply migrations
npm run db:seed               # reference data + first Owner Admin from ADMIN_BOOTSTRAP_*
npm run dev                   # api :4000, worker :4001, web :3000
```

Open http://localhost:3000 and sign in as the bootstrap owner. Emails land in Mailpit at http://localhost:8025.

`STRIPE_CONNECT_DEV_BYPASS=true` in `.env` lets host onboarding complete without a real Stripe account (ignored in production). Paid submissions need Stripe **test** keys; forward webhooks with `stripe listen --forward-to localhost:4000/api/v1/payments/webhook`.

### Database changes

Edit `packages/database/prisma/schema.prisma`, then `npm run db:migrate` (creates and applies a migration). Hand-written SQL that Prisma can't express (check constraints, triggers, partial indexes) lives in `prisma/sql/integrity.sql` and is included in the baseline migration.

## Tests

```bash
npm test                                   # unit tests for every workspace
TEST_DATABASE_URL=postgresql://... npm test # also runs the real-Postgres tests (money path, play counting)
npm run typecheck
E2E_BASE_URL=http://localhost:3000 npm run test:e2e   # browser smoke tests against a running stack
```

CI (`.github/workflows/ci.yml`) runs typecheck, all tests against a Postgres service, the app builds, and the Docker image builds.

## Production

See **[docs/deployment.md](docs/deployment.md)**. In short:

```bash
cp .env.production.example .env.production   # fill in every value
docker compose --env-file .env.production -f infrastructure/docker/docker-compose.prod.yml up -d --build
```

This runs Caddy (automatic HTTPS), web, api, worker, a one-shot `migrate` job (migrations + idempotent seed), Postgres, Redis and MinIO. Each service can be swapped for a managed equivalent.

## Docs

- [Architecture](docs/architecture.md), [Domain model](docs/domain-model.md), [Queue model](docs/queue-model.md), [Payments](docs/payment-model.md), [Ledger](docs/financial-ledger.md)
- [Deployment](docs/deployment.md), [Security baseline](docs/security-baseline.md), [Testing](docs/testing.md)
- [Architecture decisions](docs/decisions/)
