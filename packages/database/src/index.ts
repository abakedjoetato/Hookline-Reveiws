import { PrismaPg } from "@prisma/adapter-pg";
import { uuidv7 } from "uuidv7";
import { PrismaClient as GeneratedPrismaClient } from "./generated/client";

// Export Prisma model types, enums and the Prisma namespace
export * from "./generated/client";
export * from "./generated/enums";

type GeneratedOptions = ConstructorParameters<typeof GeneratedPrismaClient>[0];
type PrismaClientOptions = Omit<GeneratedOptions, "adapter"> & {
  /** Overrides DATABASE_URL. */
  connectionString?: string;
};

function resolveConnectionString(explicit?: string): string {
  const url = explicit ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set; cannot create a database client.");
  }
  return url;
}

/**
 * PrismaClient wired to Postgres through the `pg` driver adapter.
 * `new PrismaClient()` works anywhere, reading DATABASE_URL.
 * In the API, inject the single shared instance (PrismaModule) instead of
 * constructing new ones, so the app keeps one connection pool.
 */
export class PrismaClient extends GeneratedPrismaClient {
  constructor(options: PrismaClientOptions = {}) {
    const { connectionString, ...rest } = options;
    const adapter = new PrismaPg({
      connectionString: resolveConnectionString(connectionString),
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    });
    super({ ...(rest as object), adapter } as GeneratedOptions);
  }
}

// 1. Centralized UUIDv7 generator
export function generateUuidV7(): string {
  return uuidv7();
}

// 2. Global PrismaClient Instance Lifecycle Management (lazy, so importing this
//    package never requires DATABASE_URL unless a client is actually used)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma(), prop, receiver);
  },
});

// 4. Test Database Safety Guard (Prevents destructive scripts against prod/dev)
export function assertTestDatabase(): void {
  const dbUrl = process.env.DATABASE_URL || "";
  const isTest = dbUrl.includes("test") || process.env.NODE_ENV === "test";
  if (!isTest) {
    console.error(
      "❌ CRITICAL FAILSAGE TRIGGERED: Attempted a destructive action against a non-test database!",
      {
        databaseUrl: dbUrl.replace(/:([^:@]+)@/, ":****@"), // Sanitize credentials in logs
      },
    );
    throw new Error(
      "Database action aborted: Destination is not an isolated test environment database.",
    );
  }
}

// 5. Pagination Primitives
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export async function paginate<T, Args>(
  model: {
    findMany: (args: Args & { skip: number; take: number }) => Promise<T[]>;
    count: (args: { where?: any }) => Promise<number>;
  },
  args: Args & { where?: any },
  params: PaginationParams = {},
): Promise<PaginatedResult<T>> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.max(1, Math.min(100, params.limit || 10)); // Cap limit at 100 max for safety
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    model.findMany({ ...args, skip, take: limit }),
    model.count({ where: args.where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

// 6. Database Error Normalizer
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

export function normalizeDatabaseError(error: unknown): DatabaseError {
  const isErrorObject =
    error instanceof Error || (error !== null && typeof error === "object");

  if (isErrorObject) {
    const prismaError = error as any;
    if (prismaError.code) {
      switch (prismaError.code) {
        case "P2002":
          return new DatabaseError(
            `Unique constraint violation: record already exists on fields (${prismaError.meta?.target?.join(", ") || ""})`,
            prismaError.code,
            error,
          );
        case "P2003":
          return new DatabaseError(
            "Foreign key constraint violation: a referenced entity does not exist.",
            prismaError.code,
            error,
          );
        case "P2025":
          return new DatabaseError(
            "Record to operate on was not found.",
            prismaError.code,
            error,
          );
        default:
          return new DatabaseError(
            prismaError.message || "Prisma database transaction failure.",
            prismaError.code,
            error,
          );
      }
    }
    if (prismaError.message) {
      return new DatabaseError(prismaError.message, undefined, error);
    }
  }
  return new DatabaseError(
    "An unknown database error occurred.",
    undefined,
    error,
  );
}

// 7. Soft Delete Query Filters & Active Record Retrievers
export function whereNotDeleted<T extends Record<string, any>>(
  whereClause: T,
): T & { deletedAt: null } {
  return {
    ...whereClause,
    deletedAt: null,
  };
}

// 8. Optimistic Concurrency Control Helper
export async function executeOptimisticUpdate<T>(
  updateFn: () => Promise<T>,
): Promise<T> {
  try {
    return await updateFn();
  } catch (error: any) {
    if (error?.code === "P2025") {
      throw new DatabaseError(
        "Optimistic lock failed: version mismatch or record deleted.",
        "OPTIMISTIC_LOCK_FAILED",
        error,
      );
    }
    throw normalizeDatabaseError(error);
  }
}

// ============================================================================
// SECTION 18: HIGH-SECURITY OWNER ADMIN SAFEGUARDS & UTILITIES
// ============================================================================

// A. Masking helper for credential replacements
export function maskSecretKey(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "••••••••";
  const prefix = secret.substring(0, 8); // preserve the original key prefix
  const suffix = secret.substring(secret.length - 4);
  return `${prefix}••••••••${suffix}`;
}

// B. Failsafe: Assert that we never delete or demote the final OWNER_ADMIN
export function assertOwnerAdminRetention(activeOwnerCount: number): void {
  if (activeOwnerCount <= 1) {
    throw new DatabaseError(
      "Database operation aborted: The final Owner Administrator cannot be removed or demoted. At least one Owner Admin must always remain.",
      "FINAL_OWNER_ADMIN_RETENTION_VIOLATION",
    );
  }
}

// C. Logger redaction utility for sensitive Stripe credentials
export function redactSecretsFromLog<T extends Record<string, any>>(obj: T): T {
  const redacted = { ...obj };
  const sensitiveKeys = [
    "password",
    "passwordHash",
    "stripeSecretKey",
    "stripe_secret_key",
    "token",
    "tokenHash",
    "secret",
  ];

  for (const key of Object.keys(redacted)) {
    if (sensitiveKeys.includes(key)) {
      redacted[key as keyof T] = "[REDACTED]" as any;
    } else if (redacted[key] !== null && typeof redacted[key] === "object") {
      redacted[key as keyof T] = redactSecretsFromLog(redacted[key]) as any;
    }
  }
  return redacted;
}
