import { z } from "zod";

// ============================================================================
// 1. Core Environmental Schema Blueprints
// ============================================================================

const infrastructureSchema = {
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection URL"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid connection URL"),
};

const s3Schema = {
  S3_ENDPOINT: z
    .string()
    .url("S3_ENDPOINT must be a valid S3 URL")
    .optional()
    .or(z.string().min(1)),
  S3_REGION: z.string().min(1, "S3_REGION is required"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_ACCESS_KEY: z.string().min(1, "S3_ACCESS_KEY is required"),
  S3_SECRET_KEY: z.string().min(1, "S3_SECRET_KEY is required"),
  S3_FORCE_PATH_STYLE: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .default(false),
};

const smtpSchema = {
  SMTP_HOST: z.string().min(1, "SMTP_HOST is required"),
  SMTP_PORT: z.coerce
    .number()
    .int()
    .positive("SMTP_PORT must be a positive integer"),
  SMTP_USER: z.string().optional().or(z.literal("")),
  SMTP_PASS: z.string().optional().or(z.literal("")),
  SMTP_FROM: z.string().email("SMTP_FROM must be a valid email"),
};

const stripeSchema = {
  STRIPE_PUBLIC_KEY: z
    .string()
    .min(1, "STRIPE_PUBLIC_KEY is required")
    .optional(),
  STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),
};

const publicUrlsSchema = {
  NEXT_PUBLIC_APP_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_WEB_URL: z.string().url("NEXT_PUBLIC_WEB_URL is required"),
  NEXT_PUBLIC_HOST_URL: z.string().url("NEXT_PUBLIC_HOST_URL is required"),
  NEXT_PUBLIC_ADMIN_URL: z.string().url("NEXT_PUBLIC_ADMIN_URL is required"),
  NEXT_PUBLIC_API_URL: z.string().url("NEXT_PUBLIC_API_URL is required"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required"),
};

// ============================================================================
// 2. Specialized Application-Specific Schemas
// ============================================================================

export const apiEnvSchema = z.object({
  ...infrastructureSchema,
  ...s3Schema,
  ...smtpSchema,
  ...stripeSchema,
  PORT: z.coerce.number().int().default(4000),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .min(1, "CORS_ALLOWED_ORIGINS list is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  ENCRYPTION_SECRET: z
    .string()
    .min(32, "ENCRYPTION_SECRET must be at least 32 characters"),
  ENABLE_SWAGGER: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .default(false),
});

export type ApiEnvConfig = z.infer<typeof apiEnvSchema>;

export const workerEnvSchema = z.object({
  NODE_ENV: infrastructureSchema.NODE_ENV,
  REDIS_URL: infrastructureSchema.REDIS_URL,
  ...s3Schema,
  ...smtpSchema,
  WORKER_PORT: z.coerce.number().int().default(4001),
  WORKER_CONCURRENCY: z.coerce.number().int().default(5),
});

export type WorkerEnvConfig = z.infer<typeof workerEnvSchema>;

export const frontendEnvSchema = z.object({
  NODE_ENV: infrastructureSchema.NODE_ENV,
  ...publicUrlsSchema,
});

export type FrontendEnvConfig = z.infer<typeof frontendEnvSchema>;

// Helpers to validate environment variables
export function validateApiEnv(config: Record<string, unknown>): ApiEnvConfig {
  const result = apiEnvSchema.safeParse(config);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n");
    console.error(
      "❌ Invalid API backend environment variables:\n" + errorDetails,
    );
    throw new Error("API Environment validation failed");
  }
  return result.data;
}

export function validateWorkerEnv(
  config: Record<string, unknown>,
): WorkerEnvConfig {
  const result = workerEnvSchema.safeParse(config);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n");
    console.error("❌ Invalid Worker environment variables:\n" + errorDetails);
    throw new Error("Worker Environment validation failed");
  }
  return result.data;
}

export function validateFrontendEnv(
  config: Record<string, unknown>,
): FrontendEnvConfig {
  const result = frontendEnvSchema.safeParse(config);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n");
    console.error(
      "❌ Invalid Frontend environment variables:\n" + errorDetails,
    );
    throw new Error("Frontend Environment validation failed");
  }
  return result.data;
}

// ============================================================================
// 3. User & Auth Payloads Input Schemas
// ============================================================================

export const signUpSchema = z.object({
  email: z.string().email("Invalid email address"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username cannot exceed 30 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain alphanumeric characters, underscores, and hyphens",
    ),
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .max(50, "Display name cannot exceed 50 characters"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character",
    ),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestSchema
>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: signUpSchema.shape.password,
});

export type PasswordResetConfirmInput = z.infer<
  typeof passwordResetConfirmSchema
>;

// ============================================================================
// 4. Centralized Production Database-Facing Input Schemas
// ============================================================================

// A. UUID Validation Schema
export const uuidSchema = z.string().uuid("Must be a valid UUID");

// B. Currency Constraints (USD only initial release)
export const currencySchema = z.literal("USD", {
  errorMap: () => ({
    message: "Currency must strictly be USD for the initial release",
  }),
});

// C. Monetary Minor Units Validation (Integer cents >= 0)
export const monetaryCentsSchema = z
  .number()
  .int("Monetary amounts must be represented as integer cents")
  .nonnegative("Monetary amounts cannot be negative");

// D. Streaming Platform Identifiers Validation
export const streamingPlatformSchema = z.enum([
  "KICK",
  "YOUTUBE",
  "TIKTOK",
  "FACEBOOK",
  "TWITCH",
]);

// E. External Social Profile Profile URL Validation
export const externalSocialUrlSchema = z
  .string()
  .url("Must be a valid URL")
  .regex(
    /^(https?:\/\/)?(www\.)?(twitch\.tv|youtube\.com|youtu\.be|tiktok\.com|kick\.com|facebook\.com)\/.+/i,
    "URL must match one of the supported streaming platforms profile syntax",
  );

// F. Artist & Track Metadata Schema
export const artistNameSchema = z
  .string()
  .min(1, "Artist name cannot be blank")
  .max(100, "Artist name cannot exceed 100 characters")
  .transform((val) => val.trim());

export const songNameSchema = z
  .string()
  .min(1, "Song name cannot be blank")
  .max(150, "Song name cannot exceed 150 characters")
  .transform((val) => val.trim());

// G. Priority Tier Validation Schema
export const priorityTierInputSchema = z.object({
  name: z.string().min(1, "Tier name is required").max(50),
  description: z.string().max(200).optional(),
  priceCents: monetaryCentsSchema.refine((val) => val >= 200, {
    message:
      "Price cannot be lower than the platform price floor of $2.00 USD (200 cents)",
  }),
  currency: currencySchema,
  priorityRank: z
    .number()
    .int()
    .positive("Priority rank must be a positive integer"),
});

// H. Queue Limits Configuration Schema
export const queueLimitsSchema = z.object({
  maxFreeSubmissionsPerUser: z
    .number()
    .int()
    .positive("Limits must be positive integers")
    .default(1),
  maxQueueSize: z
    .number()
    .int()
    .positive("Max queue size must be a positive integer")
    .default(100),
  totalFreeCapacityLimit: z.number().int().positive().optional(),
});

// I. Commission Split Percentage Schema (Validation sums to 100%)
export const commissionSplitSchema = z
  .object({
    hostPercentage: z.number().min(0).max(100),
    platformPercentage: z.number().min(0).max(100),
  })
  .refine((data) => data.hostPercentage + data.platformPercentage === 100, {
    message:
      "The split host percentage and platform percentage must sum to exactly 100%",
  });

// J. Pagination Parameters Validation
export const paginationParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

// K. Queue History and Batch Validation Schemas
export const queueBatchOperationTypeSchema = z.enum([
  "MOVE_TO_HISTORY",
  "REINSERT_TO_QUEUE",
  "REMOVE_FROM_ACTIVE_QUEUE",
]);

export const queueBatchOperationSchema = z.object({
  liveSessionId: uuidSchema,
  stationId: uuidSchema,
  hostUserId: uuidSchema,
  operationType: queueBatchOperationTypeSchema,
  reason: z.string().optional(),
  selectedEntryCount: z.number().int().positive("Must select at least one entry"),
  requestId: z.string().optional(),
  correlationId: z.string().optional(),
});

export type QueueBatchOperationInput = z.infer<typeof queueBatchOperationSchema>;

export const queueEventSchema = z.object({
  queueEntryId: uuidSchema,
  liveSessionId: uuidSchema,
  actingUserId: uuidSchema.optional().nullable(),
  eventType: z.string().min(1, "Event type is required"),
  previousState: z.string().optional().nullable(),
  newState: z.string().min(1, "New state is required"),
  previousPosition: z.number().int().optional().nullable(),
  newPosition: z.number().int().optional().nullable(),
  reason: z.string().optional().nullable(),
  batchOperationId: uuidSchema.optional().nullable(),
  requestId: z.string().optional().nullable(),
  correlationId: z.string().optional().nullable(),
});

export type QueueEventInput = z.infer<typeof queueEventSchema>;

// L. Centralized Reserved Host Slugs & Route Protection
export const RESERVED_SLUGS = [
  "admin",
  "api",
  "host",
  "login",
  "register",
  "account",
  "settings",
  "legal",
  "privacy",
  "terms",
  "support",
  "about",
  "live",
  "stations",
  "music",
  "queue",
  "uploads",
] as const;

export const hostSlugSchema = z
  .string()
  .min(3, "Host slug must be at least 3 characters")
  .max(50, "Host slug cannot exceed 50 characters")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Host slug can only contain alphanumeric characters, underscores, and hyphens"
  )
  .refine(
    (val) => {
      const normalized = val.toLowerCase().trim();
      return !RESERVED_SLUGS.includes(normalized as any);
    },
    {
      message: "This slug matches a reserved system route and cannot be used",
    }
  );
