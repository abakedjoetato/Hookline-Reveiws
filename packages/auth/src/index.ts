import { AccountStatus } from "@platform/types";
import * as crypto from "crypto";
import * as argon2 from "argon2";

// 1. Authenticated User interface
export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  isHost: boolean;
  isAdmin: boolean;
  accountStatus: AccountStatus;
  emailVerified: boolean;
}

// 2. Role-checking and permission-checking helpers
export function isUserAdmin(user: AuthenticatedUser): boolean {
  return user.isAdmin && user.accountStatus === AccountStatus.ACTIVE;
}

export function isUserHost(user: AuthenticatedUser): boolean {
  return (
    (user.isHost || user.isAdmin) && user.accountStatus === AccountStatus.ACTIVE
  );
}

export function isUserActive(user: AuthenticatedUser): boolean {
  return user.accountStatus === AccountStatus.ACTIVE;
}

// 3. Cryptographically secure random token generator for sessions/secrets
// Secure tokens (session tokens, password resets) use secure bytes, NOT UUIDs.
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// 4. Argon2 Password Hashing
// Argon2id with production-safe parameters
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(
  passwordHash: string,
  passwordAttempt: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, passwordAttempt);
  } catch (err) {
    return false;
  }
}

// 5. Session Abstraction (Metadata payload format for application layer)
export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt?: Date;
  revocationReason?: string;
  ipAddress?: string;
  userAgent?: string;
}

// 6. Authentication Error Types
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = "Authentication required") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = "Access denied") {
    super(message, "FORBIDDEN", 403);
  }
}

export class SessionExpiredError extends AuthError {
  constructor(message = "Session has expired") {
    super(message, "SESSION_EXPIRED", 401);
  }
}
