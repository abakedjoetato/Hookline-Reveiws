import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env; pick up the repo-root file in development
for (const file of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* not present */
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Placeholder lets `prisma generate` run without a database (e.g. in CI or
    // Docker builds). Commands that touch the database need DATABASE_URL set.
    url: process.env.DATABASE_URL ?? "postgresql://placeholder@localhost:5432/placeholder",
  },
});
