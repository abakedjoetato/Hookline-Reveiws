# ADR 0030: Prisma 7 with the pg Driver Adapter, Compiled Workspace Packages

## Status

Accepted

## Decision

- Upgrade to Prisma 7 using the TypeScript client generator and `@prisma/adapter-pg`. The app connects through the standard `pg` driver; no native query engine ships in the images.
- The API uses one shared `PrismaClient` (`PrismaModule`) instead of one per module, so the process keeps a single connection pool (`DATABASE_POOL_SIZE`, default 10).
- Server-side workspace packages (`config`, `types`, `logger`, `validation`, `auth`, `database`) compile to `dist/` (CommonJS) and their `main`/`exports` point there, so the compiled API and worker can load them. `npm run build:packages` builds them in dependency order.
- The migration history was replaced by one baseline (`20261011000000_baseline`), generated from the schema plus `prisma/sql/integrity.sql`. The previous history could not be applied to an empty database (two migrations were ordered before the tables they altered). No production database existed, so no data migration is needed.

## Consequences

- `prisma.config.ts` holds the datasource URL (Prisma 7 removed it from the schema).
- Packages must be built before apps typecheck or run; Turborepo and the root scripts handle this.
