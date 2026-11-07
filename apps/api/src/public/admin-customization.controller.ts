import { Body, Controller, Get, Post, Put, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { updateCustomizationSchema } from "@platform/validation";
import type { UpdateCustomizationInput } from "@platform/validation";
import { AdminPermission, Role } from "@platform/types";
import { SessionGuard } from "../auth/guards/session.guard";
import { AuthorizationGuard } from "../auth/guards/authorization.guard";
import { RequiredPermissions, RequiredRoles } from "../auth/decorators/auth.decorators";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";
import { ZodBody } from "../common/zod-validation.pipe";
import { SiteCustomizationService } from "./site-customization.service";

const assetUploadSchema = z.object({
  assetType: z.enum(["logo", "favicon", "artwork"]),
  mimeType: z.string().min(1).max(100),
});

/** Admin → Customization: /api/v1/admin/customization */
@Controller("admin/customization")
@UseGuards(SessionGuard, AuthorizationGuard)
@RequiredRoles(Role.OWNER_ADMIN, Role.MODERATOR)
export class AdminCustomizationController {
  constructor(private readonly customization: SiteCustomizationService) {}

  @Get()
  @RequiredPermissions(AdminPermission.PLATFORM_SETTINGS_MANAGE)
  get() {
    return this.customization.getAdmin();
  }

  @Put()
  @RequiredPermissions(AdminPermission.PLATFORM_SETTINGS_MANAGE)
  update(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(updateCustomizationSchema)) body: UpdateCustomizationInput,
  ) {
    return this.customization.update(req.user.id, body);
  }

  @Post("reset")
  @RequiredPermissions(AdminPermission.PLATFORM_SETTINGS_MANAGE)
  reset(@Req() req: RequestWithUser) {
    return this.customization.reset(req.user.id);
  }

  @Post("assets/upload-url")
  @RequiredPermissions(AdminPermission.PLATFORM_SETTINGS_MANAGE)
  createAssetUploadUrl(
    @Body(new ZodBody(assetUploadSchema)) body: z.infer<typeof assetUploadSchema>,
  ) {
    return this.customization.createAssetUploadUrl(body);
  }
}
