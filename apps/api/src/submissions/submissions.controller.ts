import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  Headers,
  BadRequestException,
} from "@nestjs/common";
import { SubmissionsService } from "./submissions.service";
import { SubmissionEligibilityService } from "./submission-eligibility.service";
import { SessionGuard } from "../auth/guards/session.guard";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";
import { IsString, IsOptional, IsUUID } from "class-validator";
import { UpgradeSubmissionDto } from "./dto/upgrade-submission.dto";

export class CreateSubmissionDto {
  @IsUUID()
  sourceTrackId: string;

  @IsUUID()
  artistIdentityId: string;

  @IsOptional()
  @IsUUID()
  tierSnapshotId?: string;
}

@Controller("live-sessions")
@UseGuards(SessionGuard)
export class SubmissionsController {
  constructor(
    private readonly submissionsService: SubmissionsService,
    private readonly eligibilityService: SubmissionEligibilityService,
  ) {}

  @Get(":id/submission-eligibility")
  async getEligibility(@Req() req: RequestWithUser, @Param("id") id: string) {
    return this.eligibilityService.getEligibility(req.user.id, id);
  }

  @Post(":id/submissions")
  async createSubmission(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: CreateSubmissionDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException("Idempotency-Key header is required");
    }
    return this.submissionsService.createSubmission(
      req.user.id,
      id,
      dto,
      idempotencyKey,
    );
  }

  @Post("submissions/:submissionId/upgrade")
  async upgradeSubmission(
    @Req() req: RequestWithUser,
    @Param("submissionId") submissionId: string,
    @Body() dto: UpgradeSubmissionDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException("Idempotency-Key header is required");
    }
    return this.submissionsService.upgradeSubmission(
      req.user.id,
      submissionId,
      dto,
      idempotencyKey,
    );
  }
}
