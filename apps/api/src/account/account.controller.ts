import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import {
  changePasswordSchema,
  createArtistIdentitySchema,
  updateArtistIdentitySchema,
  updateUserProfileSchema,
  ChangePasswordInput,
  CreateArtistIdentityInput,
  UpdateArtistIdentityInput,
  UpdateUserProfileInput,
} from "@platform/validation";
import { SessionGuard } from "../auth/guards/session.guard";
import { SessionService } from "../auth/services/session.service";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";
import { ZodBody } from "../common/zod-validation.pipe";
import { clientIp, userAgent } from "../common/request-meta";
import { AccountService } from "./account.service";

const preferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
  soundEffects: z.boolean().optional(),
  themeMode: z.enum(["dark", "system"]).optional(),
});

@Controller("account")
@UseGuards(SessionGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly sessionService: SessionService,
  ) {}

  @Get("profile")
  getProfile(@Req() req: RequestWithUser) {
    return this.account.getProfile(req.user.id);
  }

  @Patch("profile")
  updateProfile(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(updateUserProfileSchema)) body: UpdateUserProfileInput,
  ) {
    return this.account.updateProfile(req.user.id, body, {
      ipAddress: clientIp(req),
      userAgent: userAgent(req),
    });
  }

  @Post("change-password")
  changePassword(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.account.changePassword(req.user.id, req.sessionId, body, {
      ipAddress: clientIp(req),
      userAgent: userAgent(req),
    });
  }

  @Get("sessions")
  sessions(@Req() req: RequestWithUser) {
    return this.account.listSessions(req.user.id, req.sessionId);
  }

  @Delete("sessions/:id")
  revokeSession(@Req() req: RequestWithUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.account.revokeSession(req.user.id, id, { ipAddress: clientIp(req) });
  }

  @Post("logout-all")
  async logoutAll(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
    const clearCookie = await this.sessionService.revokeAllSessions(req.user.id, clientIp(req));
    res.setHeader("Set-Cookie", clearCookie);
    return { success: true, message: "Signed out of all sessions" };
  }

  @Get("security-logs")
  securityLogs(@Req() req: RequestWithUser) {
    return this.account.securityLog(req.user.id);
  }

  @Get("preferences")
  getPreferences(@Req() req: RequestWithUser) {
    return this.account.getPreferences(req.user.id);
  }

  @Put("preferences")
  updatePreferences(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(preferencesSchema)) body: z.infer<typeof preferencesSchema>,
  ) {
    return this.account.updatePreferences(req.user.id, body);
  }

  @Get("artists")
  listArtists(@Req() req: RequestWithUser) {
    return this.account.listArtists(req.user.id);
  }

  @Post("artists")
  createArtist(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(createArtistIdentitySchema)) body: CreateArtistIdentityInput,
  ) {
    return this.account.createArtist(req.user.id, body);
  }

  @Get("artists/:id")
  getArtist(@Req() req: RequestWithUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.account.getArtist(req.user.id, id);
  }

  @Patch("artists/:id")
  updateArtist(
    @Req() req: RequestWithUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(updateArtistIdentitySchema)) body: UpdateArtistIdentityInput,
  ) {
    return this.account.updateArtist(req.user.id, id, body);
  }

  @Delete("artists/:id")
  deleteArtist(@Req() req: RequestWithUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.account.deleteArtist(req.user.id, id);
  }
}
