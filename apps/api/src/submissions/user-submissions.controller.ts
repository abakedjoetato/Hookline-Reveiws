import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Headers,
  BadRequestException,
} from "@nestjs/common";
import { SubmissionsService } from "./submissions.service";
import { SessionGuard } from "../auth/guards/session.guard";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";
import { UpgradeSubmissionDto } from "./dto/upgrade-submission.dto";

@Controller("submissions")
@UseGuards(SessionGuard)
export class UserSubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Get("mine")
  async getMySubmissions(@Req() req: RequestWithUser) {
    return this.submissionsService.getMySubmissions(req.user.id);
  }

  @Post(":submissionId/upgrade")
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
