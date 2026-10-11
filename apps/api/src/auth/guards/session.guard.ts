import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY, OPTIONAL_SESSION_KEY } from "../decorators/auth.decorators";
import { CookieService } from "../services/cookie.service";
import { SessionService } from "../services/session.service";
import { Request } from "express";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cookieService: CookieService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_SESSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const cookieHeader = request.headers.cookie;

    const rawToken = this.cookieService.parseSessionToken(cookieHeader);
    if (!rawToken) {
      if (isOptional) return true;
      throw new UnauthorizedException("Authentication required");
    }

    try {
      // validateSession also resolves and attaches roles and effective permissions!
      const { user, sessionId } = await this.sessionService.validateSessionWithId(rawToken);
      (request as any).user = user;
      (request as any).sessionId = sessionId;
      return true;
    } catch (error) {
      if (isOptional) {
        const response = context.switchToHttp().getResponse();
        response.setHeader("Set-Cookie", this.cookieService.createClearSessionCookie());
        return true;
      }
      // Clear cookie if session is invalid to reset client state securely
      const response = context.switchToHttp().getResponse();
      response.setHeader(
        "Set-Cookie",
        this.cookieService.createClearSessionCookie(),
      );
      throw new UnauthorizedException("Session invalid or expired");
    }
  }
}
