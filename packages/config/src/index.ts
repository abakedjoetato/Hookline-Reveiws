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

export const getPublicAppOrigin = (): string => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const envOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.PUBLIC_APPLICATION_ORIGIN ||
    process.env.APP_URL;
  if (envOrigin) {
    return envOrigin.replace(/\/$/, "");
  }
  return "";
};

export const getPublicStationUrl = (hostnameOrSlug: string): string => {
  const origin = getPublicAppOrigin();
  const cleanSlug = (hostnameOrSlug || "").replace(/^\//, "");
  return origin ? `${origin}/${cleanSlug}` : `/${cleanSlug}`;
};

export const TERMS_METADATA = {
  version: "2026-08-25.1",
  effectiveDate: "August 25, 2026",
  lastUpdated: "August 25, 2026",
} as const;

export const PRIVACY_METADATA = {
  version: "2026-08-25.1",
  effectiveDate: "August 25, 2026",
  lastUpdated: "August 25, 2026",
} as const;

export const getLegalConfig = () => ({
  entityName:
    process.env.LEGAL_ENTITY_NAME || "[OPERATOR / LEGAL ENTITY NAME]",
  legalEmail: process.env.LEGAL_CONTACT_EMAIL || "legal@thequeue.live",
  copyrightEmail:
    process.env.COPYRIGHT_CONTACT_EMAIL || "dmca@thequeue.live",
  mailingAddress:
    process.env.LEGAL_MAILING_ADDRESS || "[DESIGNATED LEGAL MAILING ADDRESS]",
  governingJurisdiction:
    process.env.GOVERNING_JURISDICTION || "[SPECIFIED GOVERNING JURISDICTION]",
});


