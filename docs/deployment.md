# Deployment

The repo ships one `Dockerfile` with four targets (`api`, `worker`, `web`, `migrate`) and a single-server stack in `infrastructure/docker/docker-compose.prod.yml`.

## 1. Before the first deploy

1. **Server:** any Linux VM with Docker (2 vCPU / 4 GB RAM is plenty to start). Open ports 80 and 443.
2. **DNS:** point `SITE_DOMAIN` (e.g. `thequeue.example.com`) and `MEDIA_DOMAIN` (e.g. `media.thequeue.example.com`) at the server. Caddy obtains HTTPS certificates automatically.
3. **Email:** an SMTP provider (Postmark, SES, Mailgun, Resend). Verification and password-reset emails depend on it.
4. **Stripe:**
   - Activate Connect (Express accounts) on the platform account.
   - Create a webhook endpoint at `https://SITE_DOMAIN/api/v1/payments/webhook` that also listens to **connected accounts**, with events `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `account.updated`.
   - Put the secret key, webhook signing secret and publishable key in `.env.production`.
5. **Secrets:** `cp .env.production.example .env.production` and fill every value. Generate `SESSION_SECRET` and `ENCRYPTION_SECRET` with `openssl rand -base64 48`.

## 2. Deploy

```bash
docker compose --env-file .env.production -f infrastructure/docker/docker-compose.prod.yml up -d --build
```

Order on start: Postgres/Redis/MinIO → `migrate` (applies migrations, runs the idempotent seed, creates the first Owner Admin once) → `api` and `worker` → `web` → Caddy.

Sign in with `ADMIN_BOOTSTRAP_*`, change that password under Account → Security, then:

- Admin → Platform settings: choose manual or automatic host approval.
- Admin → Customization: site name, logo, colours.

## 3. Updating

```bash
git pull
docker compose --env-file .env.production -f infrastructure/docker/docker-compose.prod.yml up -d --build
```

Migrations run automatically through the `migrate` service before the API restarts.

## 4. Using managed services instead

Every dependency is configured by environment variables, so you can remove a container and point at a managed service:

| Service | Variables |
|---|---|
| Postgres (Neon, RDS, Supabase) | `DATABASE_URL` |
| Redis (Upstash, ElastiCache) | `REDIS_URL` |
| Storage (AWS S3, Cloudflare R2) | `S3_ENDPOINT` (blank for AWS), `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` |

The bucket must stay **private**, with CORS allowing `PUT` and `GET` from `https://SITE_DOMAIN`.

Platforms such as Railway, Render or Fly.io can run the same images: build each target, run `migrate` as a release/pre-deploy command, and route `/api/*` and `/socket.io/*` to the API (or set `API_INTERNAL_URL` at web build time so the web server proxies them).

## 5. Operations

- **Health:** `GET /api/v1/health` (liveness) and `GET /api/v1/readiness` (database, Redis, storage).
- **Scaling:** the API is stateless; live-queue websocket events fan out through Redis, so several API containers can run behind the proxy. Run one or more workers.
- **Backups:** back up the Postgres volume (e.g. nightly `pg_dump`) and the MinIO volume or bucket.
- **Refunds:** issue them in the Stripe dashboard with *Reverse transfer* and *Refund application fee* ticked. The webhook records the refund and the host's income updates automatically.
- **Payment emergency stop:** setting `PaymentEmergencyControl` to `PAYMENTS_PAUSED` blocks new paid submissions immediately; free submissions continue.
