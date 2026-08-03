import { z } from 'zod';

// ============================================================================
// 1. Core Environmental Schema Blueprints
// ============================================================================

// Base infrastructure fields
const infrastructureSchema = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid connection URL'),
};

// S3 Storage parameters
const s3Schema = {
  S3_ENDPOINT: z.string().url('S3_ENDPOINT must be a valid URL').optional().or(z.string().min(1)),
  S3_REGION: z.string().min(1, 'S3_REGION is required'),
  S3_BUCKET: z.string().min(1, 'S3_BUCKET is required'),
  S3_ACCESS_KEY: z.string().min(1, 'S3_ACCESS_KEY is required'),
  S3_SECRET_KEY: z.string().min(1, 'S3_SECRET_KEY is required'),
  S3_FORCE_PATH_STYLE: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
};

// Mail service parameters
const smtpSchema = {
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required'),
  SMTP_PORT: z.coerce.number().int().positive('SMTP_PORT must be a positive integer'),
  SMTP_USER: z.string().optional().or(z.literal('')),
  SMTP_PASS: z.string().optional().or(z.literal('')),
  SMTP_FROM: z.string().email('SMTP_FROM must be a valid email'),
};

// Stripe secure gateway configs
const stripeSchema = {
  STRIPE_PUBLIC_KEY: z.string().min(1, 'STRIPE_PUBLIC_KEY is required').optional(),
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'STRIPE_WEBHOOK_SECRET is required'),
};

// Client browser exposed URLs
const publicUrlsSchema = {
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_WEB_URL: z.string().url('NEXT_PUBLIC_WEB_URL is required'),
  NEXT_PUBLIC_HOST_URL: z.string().url('NEXT_PUBLIC_HOST_URL is required'),
  NEXT_PUBLIC_ADMIN_URL: z.string().url('NEXT_PUBLIC_ADMIN_URL is required'),
  NEXT_PUBLIC_API_URL: z.string().url('NEXT_PUBLIC_API_URL is required'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required'),
};

// ============================================================================
// 2. Specialized Application-Specific Schemas
// ============================================================================

// API backend server environment validation
export const apiEnvSchema = z.object({
  ...infrastructureSchema,
  ...s3Schema,
  ...smtpSchema,
  ...stripeSchema,
  PORT: z.coerce.number().int().default(4000),
  CORS_ALLOWED_ORIGINS: z.string().min(1, 'CORS_ALLOWED_ORIGINS list is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  ENCRYPTION_SECRET: z.string().min(32, 'ENCRYPTION_SECRET must be at least 32 characters'),
  ENABLE_SWAGGER: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
});

export type ApiEnvConfig = z.infer<typeof apiEnvSchema>;

// Worker environment validation
export const workerEnvSchema = z.object({
  NODE_ENV: infrastructureSchema.NODE_ENV,
  REDIS_URL: infrastructureSchema.REDIS_URL,
  ...s3Schema,
  ...smtpSchema,
  WORKER_PORT: z.coerce.number().int().default(4001),
  WORKER_CONCURRENCY: z.coerce.number().int().default(5),
});

export type WorkerEnvConfig = z.infer<typeof workerEnvSchema>;

// Browser Frontend environment validation
export const frontendEnvSchema = z.object({
  NODE_ENV: infrastructureSchema.NODE_ENV,
  ...publicUrlsSchema,
});

export type FrontendEnvConfig = z.infer<typeof frontendEnvSchema>;

// ============================================================================
// 3. Central Validation Executables
// ============================================================================

export function validateApiEnv(config: Record<string, unknown>): ApiEnvConfig {
  const result = apiEnvSchema.safeParse(config);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    console.error('❌ Invalid API backend environment variables:\n' + errorDetails);
    throw new Error('API Environment validation failed');
  }
  return result.data;
}

export function validateWorkerEnv(config: Record<string, unknown>): WorkerEnvConfig {
  const result = workerEnvSchema.safeParse(config);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    console.error('❌ Invalid Worker environment variables:\n' + errorDetails);
    throw new Error('Worker Environment validation failed');
  }
  return result.data;
}

export function validateFrontendEnv(config: Record<string, unknown>): FrontendEnvConfig {
  const result = frontendEnvSchema.safeParse(config);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    console.error('❌ Invalid Frontend environment variables:\n' + errorDetails);
    throw new Error('Frontend Environment validation failed');
  }
  return result.data;
}

// ============================================================================
// 4. Client Input Schemas
// ============================================================================

// User Sign Up Schema
export const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain alphanumeric characters, underscores, and hyphens'),
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name cannot exceed 50 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

// User Login Schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Password Reset Request Schema
export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

// Password Reset Confirm Schema
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: signUpSchema.shape.password,
});

export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
