import { Controller, Post, Param, Body, UseGuards, Req } from "@nestjs/common";
import { AdminUsersService } from "./admin-users.service";
import { SessionGuard } from "../auth/guards/session.guard";
import { AuthorizationGuard } from "../auth/guards/authorization.guard";
import {
  RequiredRoles,
  RequiredPermissions,
} from "../auth/decorators/auth.decorators";
import { Role, AdminPermission } from "@platform/types";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";

@Controller("admin/users")
@UseGuards(SessionGuard, AuthorizationGuard)
@RequiredRoles(Role.OWNER_ADMIN, Role.MODERATOR)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Post(":id/ban")
  @RequiredPermissions(AdminPermission.USER_BAN_MANAGE)
  async banUser(
    @Req() req: RequestWithUser,
    @Param("id") targetUserId: string,
    @Body()
    body: {
      reasonCode: string;
      internalReason: string;
      userVisibleReason: string;
    },
  ) {
    return this.adminUsersService.banUser(
      targetUserId,
      req.user.id,
      body.reasonCode,
      body.internalReason,
      body.userVisibleReason,
    );
  }

  @Post(":id/delete")
  @RequiredPermissions(AdminPermission.ADMIN_PLATFORM_FULL)
  async deleteUser(@Param("id") targetUserId: string) {
    return this.adminUsersService.deleteUser(targetUserId);
  }
}
