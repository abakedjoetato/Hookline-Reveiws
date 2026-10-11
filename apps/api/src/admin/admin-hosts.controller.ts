import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from "@nestjs/common";
import { SessionGuard } from "../auth/guards/session.guard";
import { AuthorizationGuard } from "../auth/guards/authorization.guard";
import { RequiredRoles, RequiredPermissions } from "../auth/decorators/auth.decorators";
import { Role, AdminPermission, AdminHostFilterDto } from "@platform/types";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";
import { AdminHostsService } from "./admin-hosts.service";

@Controller("admin")
@UseGuards(SessionGuard, AuthorizationGuard)
@RequiredRoles(Role.OWNER_ADMIN, Role.MODERATOR)
export class AdminHostsController {
  constructor(private readonly hostsService: AdminHostsService) {}

  @Get("hosts")
  @RequiredPermissions(AdminPermission.USER_BAN_MANAGE)
  async getHosts(@Query() query: AdminHostFilterDto) {
    return this.hostsService.getHosts(query);
  }

  // Approve / reject / suspend live in host/admin-host-applications.controller.ts
  // so there is a single approval path (role, station, Stripe checks).

  @Post("hosts/:id/reinstate")
  @RequiredPermissions(AdminPermission.USER_BAN_MANAGE)
  async reinstateHost(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    return this.hostsService.reinstateHost(
      id,
      req.user.id,
      body.reason || "Host reinstated by administrator",
    );
  }
}
