import { Controller, Post, Get, Body, Param, UseGuards, Req } from "@nestjs/common";
import { SubmissionsService } from "./submissions.service";
import { SubmissionEligibilityService } from "./submission-eligibility.service";
import { SessionGuard } from "../auth/guards/session.guard";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";
import { IsString, IsOptional, IsUUID } from "class-validator";

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
    private readonly eligibilityService: SubmissionEligibilityService
  ) {}

  @Get(":id/submission-eligibility")
  async getEligibility(@Req() req: RequestWithUser, @Param("id") id: string) {
    return this.eligibilityService.getEligibility(req.user.id, id);
  }

  @Post(":id/submissions")
  async createSubmission(
    @Req() req: RequestWithUser,
    @Param("id") id: string,
    @Body() dto: CreateSubmissionDto
  ) {
    return this.submissionsService.createSubmission(req.user.id, id, dto);
  }
}
