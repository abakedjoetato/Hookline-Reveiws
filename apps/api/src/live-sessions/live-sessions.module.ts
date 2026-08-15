import { Module } from "@nestjs/common";
import { LiveSessionsController } from "./live-sessions.controller";
import { LiveSessionsService } from "./live-sessions.service";
import { AuthProtectionModule } from "../auth/protection/auth-protection.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaClient } from "@platform/database";
import { QueueOrderingService } from "./queue-ordering.service";

@Module({
  imports: [AuthProtectionModule, AuthModule],
  controllers: [LiveSessionsController],
  providers: [
    LiveSessionsService,
    QueueOrderingService,
    {
      provide: PrismaClient,
      useValue: new PrismaClient(),
    },
  ],
  exports: [LiveSessionsService],
})
export class LiveSessionsModule {}
