import { Injectable } from "@nestjs/common";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import type { PlatformSettingsDto } from "@platform/types";

const CONFIG_ID = "00000000-0000-0000-0000-000000000002";

const DEFAULTS = {
  requireManualHostApproval: true,
  allowPublicRegistrations: true,
  maintenanceMode: false,
};

/**
 * Admin-editable platform switches, stored in PlatformConfiguration.featureFlags
 * (JSON) alongside the price floor/ceiling.
 */
@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  private async row() {
    return this.prisma.platformConfiguration.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, featureFlags: JSON.stringify(DEFAULTS) },
      update: {},
    });
  }

  private parseFlags(raw: string | null | undefined): Record<string, unknown> {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  async get(): Promise<PlatformSettingsDto & { minimumPriorityPrice: number; maximumPriorityPrice: number }> {
    const row = await this.row();
    const flags = { ...DEFAULTS, ...this.parseFlags(row.featureFlags) } as Record<string, any>;
    return {
      requireManualHostApproval: Boolean(flags.requireManualHostApproval),
      allowPublicRegistrations: Boolean(flags.allowPublicRegistrations),
      maintenanceMode: Boolean(flags.maintenanceMode),
      updatedAt: row.updatedAt.toISOString(),
      updatedByUserId: (flags.updatedByUserId as string) ?? null,
      minimumPriorityPrice: row.minimumPriorityPrice,
      maximumPriorityPrice: row.maximumPriorityPrice,
    };
  }

  async update(
    actorUserId: string,
    changes: Partial<Pick<PlatformSettingsDto, "requireManualHostApproval" | "allowPublicRegistrations" | "maintenanceMode">>,
  ) {
    const row = await this.row();
    const before = this.parseFlags(row.featureFlags);
    const after = { ...DEFAULTS, ...before, ...changes, updatedByUserId: actorUserId };
    await this.prisma.$transaction([
      this.prisma.platformConfiguration.update({
        where: { id: CONFIG_ID },
        data: { featureFlags: JSON.stringify(after) },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          id: generateUuidV7(),
          actingAdminUserId: actorUserId,
          actionType: "PLATFORM_SETTINGS_UPDATED",
          targetEntityType: "PlatformConfiguration",
          targetEntityId: CONFIG_ID,
          beforeState: JSON.stringify(before),
          afterState: JSON.stringify(after),
          reason: "Platform settings updated from admin console",
        },
      }),
    ]);
    return this.get();
  }
}
