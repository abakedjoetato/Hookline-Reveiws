import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { hexColorSchema } from "@platform/validation";
import type { UpdateCustomizationInput } from "@platform/validation";
import type {
  AdminCustomizationConfig,
  PublicThemeConfig,
  ThemeTokens,
} from "@platform/types";
import { STORAGE_SERVICE, StorageService } from "../storage/storage.interface";

/** Single site-wide row (same pattern as PlatformConfiguration's fixed id). */
export const SITE_CUSTOMIZATION_ID = "00000000-0000-0000-0000-000000000005";

/** Uploaded branding assets live under this prefix and are the only objects served publicly. */
export const SITE_ASSET_PREFIX = "site-assets";

/** Public path the web app uses for an uploaded asset (same origin via /api/v1). */
export const PUBLIC_MEDIA_PATH = "/api/v1/media/public";

/** Factory defaults; must match the column defaults in schema.prisma. */
export const DEFAULT_SITE_NAME = "TheQueue";
export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  primaryColor: "#8B5CF6",
  primaryHoverColor: "#7C3AED",
  secondaryColor: "#27272A",
  accentColor: "#A78BFA",
  backgroundColor: "#09090B",
  surfaceColor: "#18181B",
  textColor: "#FAFAFA",
  mutedTextColor: "#A1A1AA",
  borderColor: "#27272A",
  liveColor: "#EF4444",
  successColor: "#22C55E",
  warningColor: "#F59E0B",
  dangerColor: "#EF4444",
};

const TOKEN_KEYS = Object.keys(DEFAULT_THEME_TOKENS) as (keyof ThemeTokens)[];

export type SiteAssetType = "logo" | "favicon" | "artwork";

const ASSET_TYPES: readonly SiteAssetType[] = ["logo", "favicon", "artwork"];

/** Image types accepted for branding uploads, with the extension stored on the object key. */
const ASSET_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

type SiteCustomizationRow = {
  id: string;
  siteName: string;
  primaryLogoUrl: string | null;
  alternateLogoUrl: string | null;
  faviconUrl: string | null;
  customCss: string | null;
  updatedByUserId: string | null;
  updatedAt: Date;
} & ThemeTokens;

/**
 * Global branding: site name, logos, favicon and colour tokens.
 * Read publicly by every page (ThemeProvider); edited from Admin → Customization.
 */
@Injectable()
export class SiteCustomizationService {
  constructor(
    private readonly prisma: PrismaClient,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  private async row(): Promise<SiteCustomizationRow> {
    return this.prisma.siteCustomization.upsert({
      where: { id: SITE_CUSTOMIZATION_ID },
      create: { id: SITE_CUSTOMIZATION_ID },
      update: {},
    });
  }

  private tokensOf(row: SiteCustomizationRow): ThemeTokens {
    const tokens = {} as ThemeTokens;
    for (const key of TOKEN_KEYS) tokens[key] = row[key];
    return tokens;
  }

  private toPublic(row: SiteCustomizationRow): PublicThemeConfig {
    return {
      siteName: row.siteName,
      primaryLogoUrl: row.primaryLogoUrl,
      alternateLogoUrl: row.alternateLogoUrl,
      faviconUrl: row.faviconUrl,
      tokens: this.tokensOf(row),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toAdmin(row: SiteCustomizationRow): AdminCustomizationConfig {
    return {
      ...this.toPublic(row),
      id: row.id,
      customCss: row.customCss,
      updatedByUserId: row.updatedByUserId,
    };
  }

  async getPublic(): Promise<PublicThemeConfig> {
    return this.toPublic(await this.row());
  }

  async getAdmin(): Promise<AdminCustomizationConfig> {
    return this.toAdmin(await this.row());
  }

  /**
   * Partial update. Omitted fields are left alone; `null` or "" clears a URL.
   * Colours may arrive in `tokens` (what the admin page sends) or as flat fields;
   * flat fields win when both are given.
   */
  async update(
    actorUserId: string,
    input: UpdateCustomizationInput,
  ): Promise<AdminCustomizationConfig> {
    const before = await this.row();
    const data: Record<string, string | null> = {};

    if (input.siteName !== undefined) data.siteName = input.siteName.trim();

    for (const key of ["primaryLogoUrl", "alternateLogoUrl", "faviconUrl"] as const) {
      const value = input[key];
      if (value !== undefined) data[key] = value ? value.trim() : null;
    }

    if (input.tokens) {
      for (const [key, value] of Object.entries(input.tokens)) {
        if (!(TOKEN_KEYS as string[]).includes(key)) continue;
        const parsed = hexColorSchema.safeParse(value);
        if (!parsed.success) {
          throw new BadRequestException(`tokens.${key}: must be a hex colour such as #8B5CF6`);
        }
        data[key] = parsed.data;
      }
    }
    for (const key of TOKEN_KEYS) {
      const value = input[key];
      if (value !== undefined) data[key] = value;
    }

    if (input.customCss !== undefined) data.customCss = input.customCss || null;

    return this.save(actorUserId, before, data, "SITE_CUSTOMIZATION_UPDATED", "Branding updated from admin console");
  }

  async reset(actorUserId: string): Promise<AdminCustomizationConfig> {
    const before = await this.row();
    return this.save(
      actorUserId,
      before,
      {
        siteName: DEFAULT_SITE_NAME,
        primaryLogoUrl: null,
        alternateLogoUrl: null,
        faviconUrl: null,
        customCss: null,
        ...DEFAULT_THEME_TOKENS,
      },
      "SITE_CUSTOMIZATION_RESET",
      "Branding reset to defaults from admin console",
    );
  }

  private async save(
    actorUserId: string,
    before: SiteCustomizationRow,
    data: Record<string, string | null>,
    actionType: string,
    reason: string,
  ): Promise<AdminCustomizationConfig> {
    const [after] = await this.prisma.$transaction([
      this.prisma.siteCustomization.update({
        where: { id: SITE_CUSTOMIZATION_ID },
        data: { ...data, updatedByUserId: actorUserId },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          id: generateUuidV7(),
          actingAdminUserId: actorUserId,
          actionType,
          targetEntityType: "SiteCustomization",
          targetEntityId: SITE_CUSTOMIZATION_ID,
          beforeState: JSON.stringify(this.toAdmin(before)),
          afterState: JSON.stringify(data),
          reason,
        },
      }),
    ]);
    return this.toAdmin(after);
  }

  /** Presigned PUT for a logo/favicon/artwork image, plus the public URL to save once uploaded. */
  async createAssetUploadUrl(input: {
    assetType?: string;
    mimeType?: string;
  }): Promise<{ uploadUrl: string; assetUrl: string }> {
    if (!ASSET_TYPES.includes(input.assetType as SiteAssetType)) {
      throw new BadRequestException(`assetType must be one of: ${ASSET_TYPES.join(", ")}`);
    }
    const ext = ASSET_MIME_EXTENSIONS[input.mimeType?.toLowerCase()];
    if (!ext) {
      throw new BadRequestException(
        `Unsupported image type. Allowed: ${Object.keys(ASSET_MIME_EXTENSIONS).join(", ")}`,
      );
    }
    const presigned = await this.storage.createPresignedUpload(
      `${SITE_ASSET_PREFIX}/${input.assetType}`,
      `${input.assetType}${ext}`,
      input.mimeType.toLowerCase(),
      15 * 60,
    );
    return {
      uploadUrl: presigned.url,
      assetUrl: `${PUBLIC_MEDIA_PATH}/${presigned.objectKey}`,
    };
  }

  /**
   * Short-lived download link for a branding asset. Only keys under the
   * site-asset prefix are served, so this can't be used to read track audio.
   */
  async resolvePublicAsset(objectKey: string): Promise<string | null> {
    const valid =
      objectKey.startsWith(`${SITE_ASSET_PREFIX}/`) &&
      !objectKey.includes("..") &&
      /^[a-zA-Z0-9/_.-]+$/.test(objectKey);
    if (!valid) return null;
    if (!(await this.storage.verifyObjectExists(objectKey))) return null;
    return this.storage.createPresignedDownload(objectKey, 60 * 60);
  }
}
