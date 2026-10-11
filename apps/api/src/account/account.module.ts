import { Module } from "@nestjs/common";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";
import { SessionRepository } from "../auth/repositories/session.repository";

@Module({
  controllers: [AccountController],
  providers: [AccountService, SessionRepository],
})
export class AccountModule {}
