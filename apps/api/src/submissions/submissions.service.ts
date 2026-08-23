import { Injectable, BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { QueueStatus } from "@platform/types";
import { SubmissionEligibilityService } from "./submission-eligibility.service";
import { QueueOrderingService } from "../live-sessions/queue-ordering/queue-ordering.service";
import { ReorderIntent } from "../live-sessions/dto/live-session.dto";

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eligibilityService: SubmissionEligibilityService,
    private readonly queueOrderingService: QueueOrderingService
  ) {}

  async createSubmission(
    userId: string,
    liveSessionId: string,
    dto: { sourceTrackId: string; artistIdentityId: string; tierSnapshotId?: string }
  ): Promise<any> {
    return this.prisma.$transaction(async (tx) => {
      // Perform authoritative eligibility check
      const eligibility = await this.eligibilityService.getEligibility(userId, liveSessionId);

      if (!dto.tierSnapshotId) {
        // FREE Submission
        if (!eligibility.free.available) {
          throw new ConflictException(`Free submission not available: ${eligibility.free.reason}`);
        }

        // Increment user's free usage
        await tx.userLiveSubmissionUsage.upsert({
          where: { userId_liveSessionId: { userId, liveSessionId } },
          update: { freeUsedCount: { increment: 1 } },
          create: {
            id: generateUuidV7(),
            userId,
            liveSessionId,
            freeUsedCount: 1,
            paidUsedCount: 0
          }
        });

        // Create submission
        const submissionId = generateUuidV7();
        const submission = await tx.submission.create({
          data: {
            id: submissionId,
            submittingUserId: userId,
            sourceTrackId: dto.sourceTrackId,
            artistIdentityId: dto.artistIdentityId,
            liveSessionId,
            isPriority: false,
            currentQueueStatus: QueueStatus.QUEUED
          }
        });

        // We fetch existing active entries for bottom ordering
        const destinationEntries = await tx.queueEntry.findMany({
            where: {
                liveSessionId,
                priorityRank: 0,
                status: { in: ['QUEUED', 'NEXT'] }
            },
            orderBy: { sortOrder: 'asc' }
        });

        const { midpoint: newSortOrder } = this.queueOrderingService.calculateNewSortOrder(ReorderIntent.BOTTOM, destinationEntries as any, undefined);

        const queueEntryId = generateUuidV7();
        const queueEntry = await tx.queueEntry.create({
          data: {
            id: queueEntryId,
            liveSessionId,
            submissionId,
            status: QueueStatus.QUEUED,
            priorityRank: 0,
            sortOrder: newSortOrder!
          }
        });

        return { submission, queueEntry };

      } else {
        // PRIORITY TIER Submission
        const tier = eligibility.priorityTiers.find(t => t.tierSnapshotId === dto.tierSnapshotId);
        if (!tier) {
          throw new NotFoundException("Priority tier not found for this live session");
        }

        if (!tier.available) {
          throw new ConflictException(`Priority submission not available: ${tier.reason}`);
        }

        const submissionId = generateUuidV7();
        const submission = await tx.submission.create({
          data: {
            id: submissionId,
            submittingUserId: userId,
            sourceTrackId: dto.sourceTrackId,
            artistIdentityId: dto.artistIdentityId,
            liveSessionId,
            isPriority: true,
            priorityTierSnapshotId: dto.tierSnapshotId,
            currentQueueStatus: QueueStatus.AWAITING_PAYMENT
          }
        });

        const queueEntryId = generateUuidV7();
        const queueEntry = await tx.queueEntry.create({
          data: {
            id: queueEntryId,
            liveSessionId,
            submissionId,
            status: QueueStatus.AWAITING_PAYMENT,
            priorityRank: tier.priorityRank,
            sortOrder: 0 // Will be calculated upon successful payment
          }
        });

        return { submission, queueEntry };
      }
    });
  }
}
