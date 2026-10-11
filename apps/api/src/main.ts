// Local development: load the repo-root .env (production uses real env vars)
if (process.env.NODE_ENV !== "production") {
  for (const file of [".env", "../../.env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* file not present */
    }
  }
}

import { NestFactory } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import helmet from "helmet";
import { createLogger } from "@platform/logger";
import { APP_PORTS } from "@platform/config";
import { validateApiEnv } from "@platform/validation";
import { randomUUID } from "crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { RedisIoAdapter } from "./common/redis-io.adapter";

// Prisma returns BigInt for some columns (e.g. file sizes). Serialize them as
// numbers; every BigInt column we store is far below 2^53.
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const logger = createLogger("api");

  // Validate environment variables on startup. Fail early if invalid.
  try {
    validateApiEnv(process.env);
    logger.info("✅ Environment configuration successfully validated");
  } catch (error: any) {
    logger.error(
      "❌ Failed to start API: Environment validation failed",
      error,
    );
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: {
      log: (msg) => logger.info(msg),
      error: (msg, stack) => logger.error(msg, new Error(stack || "")),
      warn: (msg) => logger.warn(msg),
      debug: (msg) => logger.debug(msg),
      verbose: (msg) => logger.trace(msg),
    },
  });

  // 0. Behind a reverse proxy: trust the configured number of hops so req.ip
  //    (used for rate limits, lockouts and audit logs) is the real client.
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));

  // 1. Security Headers & CORS (Using an explicit environment-defined allowlist)
  app.use(helmet());

  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders:
      "Content-Type, Accept, Authorization, x-request-id, idempotency-key",
  });

  // Live queue events across API instances
  const ioAdapter = new RedisIoAdapter(app);
  await ioAdapter.connect(process.env.REDIS_URL || "redis://localhost:6379");
  app.useWebSocketAdapter(ioAdapter);

  // 2. Global Request Context / Request ID Middleware
  app.use((req: any, res: any, next: () => void) => {
    const incoming = req.headers["x-request-id"] || req.headers["x-correlation-id"];
    const requestId =
      typeof incoming === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(incoming)
        ? incoming
        : randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  });

  // 3. API URI Versioning (e.g. /api/v1/...)
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  // 4. Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 5. Swagger / OpenAPI Documentation (Disabled outside of non-production or unless explicitly configured)
  const enableSwagger =
    process.env.ENABLE_SWAGGER === "true" ||
    process.env.NODE_ENV !== "production";
  if (enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle("TheQueue API")
      .setDescription(
        "Production-grade Backend API documentation for TheQueue platform",
      )
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("docs", app, document);
    logger.info(
      `Swagger documentation initialized at http://localhost:${APP_PORTS.api}/docs`,
    );
  }

  // 6. Graceful Shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || APP_PORTS.api;
  await app.listen(port);
  logger.info(`🚀 TheQueue API backend successfully listening on port ${port}`);
}

bootstrap();
