import { Module } from "@nestjs/common";
import { LegalController } from "./legal.controller";

// LegalService is provided (and exported) by the global AuthModule, because
// registration records Terms acceptance.
@Module({
  controllers: [LegalController],
})
export class LegalModule {}
