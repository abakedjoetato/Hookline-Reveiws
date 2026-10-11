# Architectural Design & Request Flows - TheQueue

This document outlines the core architectural components, boundaries, data flows, and future integration paths established in **TheQueue** platform.

---

## 1. Monorepo Structural Hierarchy

The platform is designed as a TypeScript monorepo to ensure maximum code reusability, consistent dependency versions, and fast build times.

### Applications (`apps/`)

- **`web` (Port 3000)**: Next.js App Router site with every page: public stations and sessions, artist library and submissions, host onboarding, studio and income, admin console, and the OBS overlay. Role checks in the UI are cosmetic; the API enforces them. (The separate `host` and `admin` apps were merged in; see ADR 0029.)
- **`api` (Port 4000)**: NestJS API. The **sole authoritative data gatekeeper** and validation boundary. Also serves live-queue Socket.IO events and receives Stripe webhooks.
- **`worker` (health on Port 4001)**: Standalone BullMQ worker for media jobs (audio metadata, artwork, deletions).

The browser only ever talks to its own origin: `/api/*` and `/socket.io/*` are routed to the API by the reverse proxy in production (Caddy) and by Next.js rewrites in development, so session cookies stay first-party.

### Shared Packages (`packages/`)

- **`config`**: Baseline ESLint, Prettier, and strict TSConfig templates.
- **`types`**: System-wide domain types and state machine enums.
- **`logger`**: High-performance structured Pino logger supporting correlation request tracing.
- **`validation`**: Zod validation schemas enforcing strict inputs and environmental parameters.
- **`database`**: Prisma 7 schema and migrations, and a `PrismaClient` wired to Postgres through the `pg` driver adapter (no native query engine). The API holds one shared instance (`PrismaModule`). Also UUIDv7 generators.
- **`auth`**: Argon2id password hashing, secure token utilities, cookie configuration parameters, and privilege assertion guards.
- **`ui`**: Tailwind CSS v4 source stylesheets (`styles.css`) and 17+ dark-first reusable React components.
- **`api-client`**: Axios-based communication client with request ID propagation.

---

## 2. Definitive Request & Authentication Flow

Standard API interactions utilize strict RESTful patterns combined with highly secure session controls.

### Authentication Boundary & Session Lifecycle (Opaque Cookies)

To ensure the highest level of security, **TheQueue** utilizes **Opaque Cookie-based Session Validation**:

1. **Session Creation**:
   - On successful authentication, the API generates a cryptographically secure, random 32-byte session token (NOT a UUID).
   - The token is hashed server-side using SHA-256.
   - The SHA-256 hash, absolute expiration, and metadata (IP, User Agent) are stored as the authoritative session record in PostgreSQL.
   - The raw token is returned to the client in an `HttpOnly`, `Secure` (production-only), `SameSite=Lax` cookie.
2. **Session Verification**:
   - For every request, the browser includes the session cookie.
   - The NestJS auth guard extracts the token, hashes it with SHA-256, and queries the database (accelerated by a Redis cache) to verify the session exists, is active, and has not expired.
3. **Session Rotation**:
   - The session token is automatically rotated and re-issued after login, password changes, privilege elevation, and other security-sensitive events to prevent session-fixation attacks.
4. **Enforcement**:
   - While Next.js applications utilize server-side cookie checks to display/hide navigation panels, **the NestJS API remains the absolute enforcement boundary**. Under no circumstances does a frontend layout or query validate user privileges.

---

## 3. Data Systems Boundaries

### PostgreSQL & Prisma (Source of Truth)

PostgreSQL is the single authoritative source of truth for persistent domain models (Users, Stations, Submissions, Transactions, Sessions, Audit Records).

- All primary keys are **UUIDv7** generated inside the application service layer before write operations.
- Direct database communication occurs exclusively via the `@platform/database` package loaded on the NestJS API and worker nodes.

### Redis (Cache & Queue Broker)

Redis is utilized exclusively as a transient performance enhancer:

- **Sessions**: Caching hashed session sessions for instant NestJS auth checks.
- **BullMQ**: Queue broker managing job metadata and scheduling states.
- **Rate-limiting**: Storing sliding-window API request counters.
- Redis is NEVER the primary datastore; any item in Redis is designed to be fully recoverable or reconstructible if Redis is flushed.

### S3 Object Storage (Media Assets)

Audio uploads and track artworks are stored in private, secure, S3-compatible buckets.

- Standard clients request temporary, time-limited **S3 pre-signed URLs** from the NestJS API to perform direct secure uploads.
- Clients never receive raw write credentials.

---

## 4. Integrations

### Real-Time Communication (Socket.IO)

- Clients join a session room (`join-session`); the host is recognised from the session cookie.
- Every queue change emits an event with the new `queueRevision`; clients refetch when they detect a gap.
- Events fan out through the Redis adapter, so multiple API instances can run.
- Without a socket URL configured the web app falls back to polling every 5 seconds.

### Payment Integration (Stripe Connect Only, implemented)

- **Stripe Connect Destination Charges**: Stripe is the sole enabled payment and payout provider for our production release. Standard users submit paid priority submissions through Stripe checkout gateways.
- Broadcasters set custom priority pricing.
- 85% is immediately allocated to the host's Stripe Connected account balance, and 15% is retained by TheQueue. All Stripe processing and Connect fees are paid from TheQueue's 15% application fee.
- **No Platform Wallet**: The platform does not maintain a host balance, bank settlement timing scheduler, or payout queue. Stripe Connect handles bank transfers to broadcasters directly.
- Mock payment structures are strictly forbidden; only sandboxed Stripe webhook endpoints will drive state transitions.

### Broadcaster Station Management & Cardinality

- **Multi-Station Support**: Each HostProfile can own multiple `Station` profiles over time (`1:N` cardinality). Each station belongs to exactly one host.
- **Station Lifecycle Status**: Stations support lifecycle status (`ACTIVE`, `INACTIVE`, `ARCHIVED`). Archiving a station preserves historical live sessions, queue entries, submissions, payments, and other historical data, enforced via restrictive database foreign key constraints (`onDelete: Restrict`).
