import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { createLogger } from "@platform/logger";
import { MailModule } from "./mail/mail.module";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import Redis from "ioredis";
import { AuthModule } from "./auth/auth.module";
import { StorageModule } from "./storage/storage.module";
import { TracksModule } from "./tracks/tracks.module";
import { AdminTracksModule } from "./admin/admin-tracks.module";
import { LiveSessionsModule } from "./live-sessions/live-sessions.module";
import { SubmissionsModule } from "./submissions/submissions.module";
import { BullModule } from "@nestjs/bullmq";

import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { LegalModule } from "./legal/legal.module";
import { AccountModule } from "./account/account.module";
import { HostModule } from "./host/host.module";
import { PlatformModule } from "./platform/platform.module";
import { PublicModule } from "./public/public.module";

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl =
          config.get<string>("REDIS_URL") || "redis://localhost:6379";
        return {
          throttlers: [
            // Per client IP; ttl is in milliseconds
            {
              name: "default",
              ttl: 60_000,
              limit: Number(config.get<string>("RATE_LIMIT_PER_MINUTE") || 300),
            },
          ],
          // Store rate limits in Redis
          storage: new ThrottlerStorageRedisService(
            new Redis(redisUrl, { maxRetriesPerRequest: 1 }),
          ),
        };
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl =
          config.get<string>("REDIS_URL") || "redis://localhost:6379";
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port, 10),
          },
        };
      },
    }),
    MailModule,
    AuthModule,
    StorageModule,
    TracksModule,
    AdminTracksModule,
    LiveSessionsModule,
    SubmissionsModule,
    IdempotencyModule,

    PaymentsModule,
    LegalModule,
    AccountModule,
    HostModule,
    PlatformModule,
    PublicModule,
  ],
  controllers: [HealthController],
  // Rate limiting applies to every route (webhooks and probes opt out)
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const logger = createLogger("api");
    // Global request-response logging middleware
    consumer
      .apply((req: any, res: any, next: () => void) => {
        const start = Date.now();
        res.on("finish", () => {
          const duration = Date.now() - start;
          logger.info(
            `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
            {
              requestId: req.requestId,
              method: req.method,
              url: req.originalUrl,
              statusCode: res.statusCode,
              duration,
            },
          );
        });
        next();
      })
      .forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
