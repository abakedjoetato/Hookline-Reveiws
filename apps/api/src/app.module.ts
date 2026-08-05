import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { createLogger } from "@platform/logger";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
  ],
  controllers: [HealthController],
  providers: [],
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
