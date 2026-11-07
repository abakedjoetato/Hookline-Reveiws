import { Module } from "@nestjs/common";
import { HostModule } from "../host/host.module";
import { LiveSessionsModule } from "../live-sessions/live-sessions.module";
import { StorageModule } from "../storage/storage.module";
import { AdminCustomizationController } from "./admin-customization.controller";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";
import { SiteCustomizationService } from "./site-customization.service";

/** Public read endpoints (stations, overlays, profiles, theme) and site branding admin. */
@Module({
  imports: [HostModule, LiveSessionsModule, StorageModule],
  controllers: [PublicController, AdminCustomizationController],
  providers: [PublicService, SiteCustomizationService],
  exports: [SiteCustomizationService],
})
export class PublicModule {}
