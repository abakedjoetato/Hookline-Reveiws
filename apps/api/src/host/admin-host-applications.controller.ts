import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { updatePlatformSettingsSchema } from "@platform/validation";
import { AdminPermission, Role } from "@platform/types";
import { SessionGuard } from "../auth/guards/session.guard";
import { AuthorizationGuard } from "../auth/guards/authorization.guard";
import { RequiredPermissions, RequiredRoles } from "../auth/decorators/auth.decorators";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";
import { ZodBody } from "../common/zod-validation.pipe";
import { PlatformSettingsService } from "../platform/platform-settings.service";
import { HostService } from "./host.service";

const reasonSchema = z.object({ reason: z.string().trim().max(1000).optional() }).default({});
const platformSettingsSchema = updatePlatformSettingsSchema.extend({
  allowPublicRegistrations: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
});

@Controller("admin")
@UseGuards(SessionGuard, AuthorizationGuard)
@RequiredRoles(Role.OWNER_ADMIN, Role.MODERATOR)
export class AdminHostApplicationsController {
  constructor(
    private readonly host: HostService,
    private readonly settings: PlatformSettingsService,
  ) {}

  @Get("host-applications")
  @RequiredPermissions(AdminPermission.HOST_APPLICATION_MANAGE)
  list(@Query("status") status?: string) {
    return this.host.listApplications(status || undefined);
  }

  @Post("host-applications/:id/approve")
  @RequiredPermissions(AdminPermission.HOST_APPLICATION_MANAGE)
  approve(@Req() req: RequestWithUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.host.approveApplication(id, req.user.id);
  }

  @Post("host-applications/:id/reject")
  @RequiredPermissions(AdminPermission.HOST_APPLICATION_MANAGE)
  reject(
    @Req() req: RequestWithUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(reasonSchema)) body: z.infer<typeof reasonSchema>,
  ) {
    return this.host.rejectApplication(id, req.user.id, body.reason);
  }

  @Post("host-applications/:id/suspend")
  @RequiredPermissions(AdminPermission.HOST_APPLICATION_MANAGE)
  suspend(
    @Req() req: RequestWithUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(reasonSchema)) body: z.infer<typeof reasonSchema>,
  ) {
    return this.host.suspendHost(id, req.user.id, body.reason);
  }

  @Get("platform-settings")
  @RequiredPermissions(AdminPermission.PLATFORM_SETTINGS_MANAGE)
  getSettings() {
    return this.settings.get();
  }

  /** Turning manual approval off immediately approves eligible applicants. */
  @Put("platform-settings")
  @RequiredPermissions(AdminPermission.PLATFORM_SETTINGS_MANAGE)
  async updateSettings(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(platformSettingsSchema)) body: z.infer<typeof platformSettingsSchema>,
  ) {
    const updated = await this.settings.update(req.user.id, body);
    if (!updated.requireManualHostApproval) {
      const pending = await this.host.listApplications();
      for (const app of pending) {
        if (["SUBMITTED", "UNDER_REVIEW", "PAYMENT_VERIFICATION_REQUIRED"].includes(app.status) && app.isEligibleForApproval) {
          await this.host.maybeAutoApprove(app.applicantUserId);
        }
      }
    }
    return updated;
  }
}
