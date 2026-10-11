import { Module } from "@nestjs/common";
import { StripeService } from "./stripe.service";
import { WebhooksService } from "./webhooks.service";
import { PaymentsController } from "./payments.controller";
import { LiveSessionsModule } from "../live-sessions/live-sessions.module";

@Module({
  imports: [LiveSessionsModule],
  controllers: [PaymentsController],
  providers: [
    StripeService,
    WebhooksService,
  ],
  exports: [StripeService],
})
export class PaymentsModule {}
