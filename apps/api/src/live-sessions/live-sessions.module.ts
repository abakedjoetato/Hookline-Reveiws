import { Module } from "@nestjs/common";
import { LiveSessionsController } from "./live-sessions.controller";
import { LiveSessionsService } from "./live-sessions.service";
import { LiveSessionsGateway } from "./live-sessions.gateway";
import { LiveSessionsEventService } from "./live-sessions-event.service";
import { LiveSessionsCronService } from "./live-sessions-cron.service";
import { QueueOrderingService } from "./queue-ordering/queue-ordering.service";
import { AuthProtectionModule } from "../auth/protection/auth-protection.module";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [AuthProtectionModule, AuthModule, StorageModule],
  controllers: [LiveSessionsController],
  providers: [
    LiveSessionsGateway,
    LiveSessionsEventService,
    LiveSessionsCronService,
    LiveSessionsService,
    QueueOrderingService,
  ],
  exports: [LiveSessionsService, LiveSessionsEventService, QueueOrderingService],
})
export class LiveSessionsModule {}
