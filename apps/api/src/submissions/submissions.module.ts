import { Module } from "@nestjs/common";
import { SubmissionsController } from "./submissions.controller";
import { SubmissionsService } from "./submissions.service";
import { SubmissionEligibilityService } from "./submission-eligibility.service";

import { LiveSessionsModule } from "../live-sessions/live-sessions.module";
import { IdempotencyModule } from "../common/idempotency/idempotency.module";
import { PaymentsModule } from "../payments/payments.module";

@Module({
  imports: [LiveSessionsModule, IdempotencyModule, PaymentsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionEligibilityService],
  exports: [SubmissionEligibilityService],
})
export class SubmissionsModule {}
