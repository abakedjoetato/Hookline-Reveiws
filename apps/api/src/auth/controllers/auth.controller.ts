import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { PrismaClient } from "@platform/database";
import {
  signUpSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  emailVerificationConfirmSchema,
  SignUpInput,
  LoginInput,
  PasswordResetRequestInput,
  PasswordResetConfirmInput,
  EmailVerificationConfirmInput,
} from "@platform/validation";
import { AuthService } from "../services/auth.service";
import { SessionService } from "../services/session.service";
import { CookieService } from "../services/cookie.service";
import { OptionalSession, PublicRoute } from "../decorators/auth.decorators";
import { SessionGuard } from "../guards/session.guard";
import { RequestWithUser } from "../interfaces/request-with-user.interface";
import { ZodBody } from "../../common/zod-validation.pipe";
import { clientIp, userAgent } from "../../common/request-meta";
import { toUserProfile, USER_PROFILE_INCLUDE } from "../../common/user-profile.mapper";

/**
 * Auth endpoints under /api/v1/auth. Shapes match @platform/api-client.
 */
@Controller("auth")
@UseGuards(SessionGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly cookieService: CookieService,
    private readonly prisma: PrismaClient,
  ) {}

  private async profileFor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: USER_PROFILE_INCLUDE,
    });
    return user ? toUserProfile(user) : null;
  }

  @PublicRoute()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("register")
  async register(
    @Body(new ZodBody(signUpSchema)) input: SignUpInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = clientIp(req);
    const ua = userAgent(req);
    const { userId } = await this.authService.register(input, ip, ua);
    // Sign the new account in straight away; email verification unlocks
    // the rest of the account (see accountStatus).
    const cookie = await this.authService.createSessionAfterRegistration(userId, ip, ua);
    res.setHeader("Set-Cookie", cookie);
    return {
      success: true,
      message: "Account created. Check your email to verify your address.",
      user: await this.profileFor(userId),
    };
  }

  @PublicRoute()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  async login(
    @Body(new ZodBody(loginSchema)) input: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { cookie, userId } = await this.authService.login(
      input,
      clientIp(req),
      userAgent(req),
    );
    res.setHeader("Set-Cookie", cookie);
    return { success: true, user: await this.profileFor(userId) };
  }

  @PublicRoute()
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = this.cookieService.parseSessionToken(req.headers.cookie);
    const clearCookie = rawToken
      ? await this.sessionService.revokeSession(rawToken, clientIp(req))
      : this.cookieService.createClearSessionCookie();
    res.setHeader("Set-Cookie", clearCookie);
    return { success: true };
  }

  @Post("logout-all")
  async logoutAll(@Req() req: RequestWithUser, @Res({ passthrough: true }) res: Response) {
    const clearCookie = await this.sessionService.revokeAllSessions(req.user.id, clientIp(req));
    res.setHeader("Set-Cookie", clearCookie);
    return { success: true };
  }

  /** Returns `{ user: null }` (not 401) when signed out. */
  @OptionalSession()
  @Get("me")
  async getMe(@Req() req: RequestWithUser) {
    if (!req.user) return { user: null };
    return { user: await this.profileFor(req.user.id) };
  }

  @PublicRoute()
  @Post("verify-email")
  async verifyEmail(
    @Body(new ZodBody(emailVerificationConfirmSchema)) input: EmailVerificationConfirmInput,
    @Req() req: Request,
  ) {
    await this.authService.verifyEmail(input, clientIp(req));
    return { success: true, message: "Email verified." };
  }

  /** Link-click variant: /auth/verify-email?token=... */
  @PublicRoute()
  @Get("verify-email")
  async verifyEmailFromLink(@Query("token") token: string, @Req() req: Request) {
    if (!token) throw new BadRequestException("Verification token is required");
    await this.authService.verifyEmail({ token }, clientIp(req));
    return { success: true, message: "Email verified." };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("send-verification")
  async resendVerification(@Req() req: RequestWithUser) {
    await this.authService.resendEmailVerification(req.user.id, clientIp(req));
    return { success: true, message: "If your email is unverified, a new link has been sent." };
  }

  @PublicRoute()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("forgot-password")
  async requestPasswordReset(
    @Body(new ZodBody(passwordResetRequestSchema)) input: PasswordResetRequestInput,
    @Req() req: Request,
  ) {
    await this.authService.requestPasswordReset(input, clientIp(req));
    // Neutral response (no account enumeration)
    return {
      success: true,
      message: "If an account exists for that email, a reset link has been sent.",
    };
  }

  @PublicRoute()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("reset-password")
  async confirmPasswordReset(
    @Body(new ZodBody(passwordResetConfirmSchema)) input: PasswordResetConfirmInput,
    @Req() req: Request,
  ) {
    await this.authService.confirmPasswordReset(input, clientIp(req));
    return { success: true, message: "Password updated. Please sign in again." };
  }
}
