import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { QueueStatus } from "@platform/types";
import { SubmissionEligibilityService } from "./submission-eligibility.service";
import { QueueOrderingService } from "../live-sessions/queue-ordering/queue-ordering.service";
import { ReorderIntent } from "../live-sessions/dto/live-session.dto";
import { IdempotencyService } from "../common/idempotency/idempotency.service";
import { StripeService } from "../payments/stripe.service";
import { ApiIdempotencyStatus, PaymentStatus } from "@platform/database";
import * as crypto from "crypto";

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eligibilityService: SubmissionEligibilityService,
    private readonly queueOrderingService: QueueOrderingService,
    private readonly idempotencyService: IdempotencyService,
    private readonly stripeService: StripeService,
  ) {}

  async createSubmission(
    userId: string,
    liveSessionId: string,
    dto: {
      sourceTrackId: string;
      artistIdentityId: string;
      tierSnapshotId?: string;
    },
    idempotencyKey: string,
  ): Promise<any> {
    const fingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify(dto))
      .digest("hex");
    const path = `/live-sessions/${liveSessionId}/submissions`;

    const lock = await this.idempotencyService.claimLock(
      userId,
      idempotencyKey,
      path,
      fingerprint,
    );
    if (!lock.claimed) {
      return lock.cachedResponse;
    }

    try {
      const eligibility = await this.eligibilityService.getEligibility(
        userId,
        liveSessionId,
      );

      if (!dto.tierSnapshotId) {
        const responseData = await this.prisma.$transaction(async (tx) => {
          // FREE Submission
          if (!eligibility.free.available) {
            throw new ConflictException(
              `Free submission not available: ${eligibility.free.reason}`,
            );
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
              paidUsedCount: 0,
            },
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
              currentQueueStatus: QueueStatus.QUEUED,
            },
          });

          // We fetch existing active entries for bottom ordering
          const destinationEntries = await tx.queueEntry.findMany({
            where: {
              liveSessionId,
              priorityRank: 0,
              status: { in: ["QUEUED", "NEXT"] },
            },
            orderBy: { sortOrder: "asc" },
          });

          const { midpoint: newSortOrder } =
            this.queueOrderingService.calculateNewSortOrder(
              ReorderIntent.BOTTOM,
              destinationEntries as any,
              undefined,
            );

          const queueEntryId = generateUuidV7();
          const queueEntry = await tx.queueEntry.create({
            data: {
              id: queueEntryId,
              liveSessionId,
              submissionId,
              status: QueueStatus.QUEUED,
              priorityRank: 0,
              sortOrder: newSortOrder!,
            },
          });

          return { submission, queueEntry };
        });

        await this.idempotencyService.releaseLock(
          lock.record!.id,
          ApiIdempotencyStatus.COMPLETED,
          responseData,
        );
        return responseData;
      } else {
        // PRIORITY TIER Submission
        const tier = eligibility.priorityTiers.find(
          (t) => t.tierSnapshotId === dto.tierSnapshotId,
        );
        if (!tier) {
          throw new NotFoundException(
            "Priority tier not found for this live session",
          );
        }

        if (!tier.available) {
          throw new ConflictException(
            `Priority submission not available: ${tier.reason}`,
          );
        }

        // Verify payments are enabled
        const platformConfig =
          await this.prisma.stripePlatformConfiguration.findFirst({
            orderBy: { createdAt: "desc" },
          });
        if (!platformConfig || !platformConfig.isPaymentsEnabled) {
          throw new ConflictException(
            "Payments are currently disabled on the platform",
          );
        }

        const emergencyControl =
          await this.prisma.paymentEmergencyControl.findFirst({
            orderBy: { changedAt: "desc" },
          });
        if (emergencyControl && emergencyControl.state !== "PAYMENTS_ENABLED") {
          throw new ConflictException("Payments are currently paused");
        }

        const liveSession = await this.prisma.liveSession.findUnique({
          where: { id: liveSessionId },
          include: {
            station: {
              include: {
                host: {
                  include: {
                    payoutAccounts: {
                      where: { isPrimary: true, provider: "STRIPE" },
                    },
                  },
                },
              },
            },
          },
        });

        if (
          !liveSession ||
          !liveSession.station.host ||
          liveSession.station.host.payoutAccounts.length === 0
        ) {
          throw new ConflictException("Host payout account not configured");
        }

        const connectedAccountId =
          liveSession.station.host.payoutAccounts[0].providerAccountId;

        const paymentIntent = await this.stripeService.createPaymentIntent(
          tier.priceCents,
          connectedAccountId,
          { liveSessionId, tierSnapshotId: dto.tierSnapshotId, userId },
        );

        const responseData = await this.prisma.$transaction(async (tx) => {
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
              currentQueueStatus: QueueStatus.AWAITING_PAYMENT,
            },
          });

          const queueEntryId = generateUuidV7();
          const queueEntry = await tx.queueEntry.create({
            data: {
              id: queueEntryId,
              liveSessionId,
              submissionId,
              status: QueueStatus.AWAITING_PAYMENT,
              priorityRank: tier.priorityRank,
              sortOrder: 0, // Will be calculated upon successful payment
            },
          });

          const paymentId = generateUuidV7();
          await tx.payment.create({
            data: {
              id: paymentId,
              providerPaymentId: paymentIntent.id,
              payingUserId: userId,
              hostUserId: liveSession.hostId,
              submissionId: submissionId,
              grossAmountCents: tier.priceCents,
              hostAllocationCents: Math.round(tier.priceCents * 0.85),
              platformAllocationCents:
                tier.priceCents - Math.round(tier.priceCents * 0.85),
              status: PaymentStatus.CREATED,
            },
          });

          return {
            submission,
            queueEntry,
            clientSecret: paymentIntent.client_secret,
          };
        });

        await this.idempotencyService.releaseLock(
          lock.record!.id,
          ApiIdempotencyStatus.COMPLETED,
          responseData,
        );
        return responseData;
      }
    } catch (error) {
      await this.idempotencyService.releaseLock(
        lock.record!.id,
        ApiIdempotencyStatus.FAILED,
      );
      throw error;
    }
  }

  async upgradeSubmission(
    userId: string,
    submissionId: string,
    dto: { tierSnapshotId: string },
    idempotencyKey: string,
  ): Promise<any> {
    const fingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify(dto))
      .digest("hex");
    const path = `/submissions/${submissionId}/upgrade`;

    const lock = await this.idempotencyService.claimLock(
      userId,
      idempotencyKey,
      path,
      fingerprint,
    );
    if (!lock.claimed) {
      return lock.cachedResponse;
    }

    try {
      const submission = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          queueEntry: true,
          liveSession: {
            include: {
              station: {
                include: {
                  host: {
                    include: {
                      payoutAccounts: {
                        where: { isPrimary: true, provider: "STRIPE" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!submission) {
        throw new NotFoundException("Submission not found");
      }

      if (submission.submittingUserId !== userId) {
        throw new ConflictException("You do not own this submission");
      }

      if (submission.isPriority) {
        throw new ConflictException(
          "Submission is already a priority submission",
        );
      }

      const liveSessionId = submission.liveSessionId;
      const eligibility = await this.eligibilityService.getEligibility(
        userId,
        liveSessionId,
      );

      const tier = eligibility.priorityTiers.find(
        (t) => t.tierSnapshotId === dto.tierSnapshotId,
      );
      if (!tier) {
        throw new NotFoundException(
          "Priority tier not found for this live session",
        );
      }
      if (!tier.available) {
        throw new ConflictException(
          `Priority submission not available: ${tier.reason}`,
        );
      }

      // Verify payments are enabled
      const platformConfig =
        await this.prisma.stripePlatformConfiguration.findFirst({
          orderBy: { createdAt: "desc" },
        });
      if (!platformConfig || !platformConfig.isPaymentsEnabled) {
        throw new ConflictException(
          "Payments are currently disabled on the platform",
        );
      }

      const emergencyControl =
        await this.prisma.paymentEmergencyControl.findFirst({
          orderBy: { changedAt: "desc" },
        });
      if (emergencyControl && emergencyControl.state !== "PAYMENTS_ENABLED") {
        throw new ConflictException("Payments are currently paused");
      }

      if (
        !submission.liveSession.station.host ||
        submission.liveSession.station.host.payoutAccounts.length === 0
      ) {
        throw new ConflictException("Host payout account not configured");
      }

      const connectedAccountId =
        submission.liveSession.station.host.payoutAccounts[0].providerAccountId;

      const paymentIntent = await this.stripeService.createPaymentIntent(
        tier.priceCents,
        connectedAccountId,
        {
          liveSessionId,
          tierSnapshotId: dto.tierSnapshotId,
          userId,
          upgradeSubmissionId: submission.id,
        },
      );

      const responseData = await this.prisma.$transaction(async (tx) => {
        // Do NOT update the queue entry or submission state yet. Wait for webhook.
        const paymentId = generateUuidV7();
        const payment = await tx.payment.create({
          data: {
            id: paymentId,
            providerPaymentId: paymentIntent.id,
            payingUserId: userId,
            hostUserId: submission.liveSession.hostId,
            submissionId: submissionId,
            grossAmountCents: tier.priceCents,
            hostAllocationCents: Math.round(tier.priceCents * 0.85),
            platformAllocationCents:
              tier.priceCents - Math.round(tier.priceCents * 0.85),
            status: PaymentStatus.CREATED,
          },
        });

        return { payment, clientSecret: paymentIntent.client_secret };
      });

      await this.idempotencyService.releaseLock(
        lock.record!.id,
        ApiIdempotencyStatus.COMPLETED,
        responseData,
      );
      return responseData;
    } catch (error) {
      await this.idempotencyService.releaseLock(
        lock.record!.id,
        ApiIdempotencyStatus.FAILED,
      );
      throw error;
    }
  }
}
