import type { Request } from "express";

/**
 * Client IP as seen through the reverse proxy. `trust proxy` is configured in
 * main.ts, so Express resolves X-Forwarded-For safely into `req.ip`.
 */
export function clientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function userAgent(req: Request): string | undefined {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 512) : undefined;
}
