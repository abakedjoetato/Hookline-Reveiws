import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthProtectionModule } from "./protection/auth-protection.module";
import { CookieService } from "./services/cookie.service";
import { SessionService } from "./services/session.service";
import { UserRepository } from "./repositories/user.repository";
import { SessionRepository } from "./repositories/session.repository";
import { SecurityEventRepository } from "./repositories/security-event.repository";
import { TokenRepository } from "./repositories/token.repository";
import { AuthService } from "./services/auth.service";
import { AuthController } from "./controllers/auth.controller";
import { AdminInvitationService } from "./services/admin-invitation.service";
import { AdminInvitationController } from "./controllers/admin-invitation.controller";
import { MailModule } from "../mail/mail.module";
import { LegalService } from "../legal/legal.service";
import { SessionGuard } from "./guards/session.guard";
import { AuthorizationGuard } from "./guards/authorization.guard";

/**
 * Global so any module can use SessionGuard / AuthorizationGuard without
 * importing AuthModule (avoids circular imports).
 */
@Global()
@Module({
  imports: [ConfigModule, AuthProtectionModule, MailModule],
  controllers: [AuthController, AdminInvitationController],
  providers: [
    CookieService,
    SessionService,
    AuthService,
    AdminInvitationService,
    UserRepository,
    SessionRepository,
    SecurityEventRepository,
    TokenRepository,
    LegalService,
    SessionGuard,
    AuthorizationGuard,
  ],
  exports: [
    SessionGuard,
    AuthorizationGuard,
    SecurityEventRepository,
    LegalService,
    AuthProtectionModule,
    SessionService,
    CookieService,
    UserRepository,
    TokenRepository,
  ],
})
export class AuthModule {}
