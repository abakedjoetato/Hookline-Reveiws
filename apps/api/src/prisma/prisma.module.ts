import { Global, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@platform/database";

/**
 * One PrismaClient (one connection pool) for the whole API process.
 * Services keep injecting `PrismaClient` as before; this module is the only
 * provider of it.
 */
@Injectable()
export class PrismaLifecycle implements OnModuleDestroy {
  constructor(private readonly prisma: PrismaClient) {}

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useFactory: () =>
        new PrismaClient({
          log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
        }),
    },
    PrismaLifecycle,
  ],
  exports: [PrismaClient],
})
export class PrismaModule {}
