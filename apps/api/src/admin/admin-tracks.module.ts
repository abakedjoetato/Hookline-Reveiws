import { Module } from "@nestjs/common";
import { AdminTracksController } from "./admin-tracks.controller";
import { AdminTracksService } from "./admin-tracks.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";
import { PrismaClient } from "@platform/database";
import { TracksModule } from "../tracks/tracks.module";
import { AuthModule } from "../auth/auth.module";
import { MediaProcessingQueueService } from "../tracks/media-processing-queue.service";
import { BullModule } from "@nestjs/bullmq";
import { MEDIA_PROCESSING_QUEUE } from "../tracks/media-processing-queue.service";

@Module({
  imports: [
    AuthModule,
    TracksModule,
    BullModule.registerQueue({
      name: MEDIA_PROCESSING_QUEUE,
    }),
  ],
  controllers: [AdminTracksController, AdminUsersController],
  providers: [
    AdminTracksService,
    AdminUsersService,
    PrismaClient,
    MediaProcessingQueueService,
  ],
  exports: [AdminTracksService, AdminUsersService],
})
export class AdminTracksModule {}
