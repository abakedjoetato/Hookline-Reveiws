export const APP_PORTS = {
  web: 3000,
  host: 3001,
  admin: 3002,
  api: 4000,
  worker: 4001,
} as const;

export const COOKIE_NAMES = {
  session:
    process.env.NODE_ENV === "production"
      ? "__Host-platform_session"
      : "platform_session",
} as const;

export const SESSION_EXPIRY = {
  idle: 1000 * 60 * 30, // 30 minutes
  absolute: 1000 * 60 * 60 * 24 * 7, // 7 days
} as const;
