import { Module } from "@nestjs/common";
import { LiveSessionsModule } from "../live-sessions/live-sessions.module";
import { PaymentsModule } from "../payments/payments.module";
import { HostController } from "./host.controller";
import { AdminHostApplicationsController } from "./admin-host-applications.controller";
import { HostService } from "./host.service";
import { HostEarningsService } from "./host-earnings.service";

@Module({
  imports: [LiveSessionsModule, PaymentsModule],
  controllers: [HostController, AdminHostApplicationsController],
  providers: [HostService, HostEarningsService],
  exports: [HostService, HostEarningsService],
})
export class HostModule {}
