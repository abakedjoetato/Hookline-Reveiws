import { appendQueueEvent } from "../live-sessions/queue-events";
import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { splitPayment } from "@platform/config";
import { postLedgerTransaction } from "./ledger";
import {
  PrismaClient,
  PaymentStatus,
  QueueStatus,
  generateUuidV7,
} from "@platform/database";
import { QueueOrderingService } from "../live-sessions/queue-ordering/queue-ordering.service";
import { ReorderIntent } from "../live-sessions/dto/live-session.dto";
import Stripe from "stripe";
import * as crypto from "crypto";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly queueOrderingService: QueueOrderingService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async processEvent(event: Stripe.Event, rawBody: string) {
    const payloadHash = crypto
      .createHash("sha256")
      .update(rawBody)
      .digest("hex");

    // Idempotency / deduplication check
    const existingEvent = await this.prisma.paymentProviderEvent.findUnique({
      where: { providerEventId: event.id },
    });

    if (existingEvent && existingEvent.processingState === "COMPLETED") {
      this.logger.log(`Skipping already completed webhook event: ${event.id}`);
      return;
    }

    const providerEvent = await this.prisma.paymentProviderEvent.upsert({
      where: { providerEventId: event.id },
      update: {
        processingAttempts: { increment: 1 },
      },
      create: {
        id: generateUuidV7(),
        provider: "STRIPE",
        providerEventId: event.id,
        eventType: event.type,
        payloadHash,
        payloadText: JSON.stringify(event.data.object),
        processingState: "PENDING",
      },
    });

    try {
      if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await this.handlePaymentIntentSucceeded(paymentIntent);
      } else if (
        event.type === "payment_intent.payment_failed" ||
        event.type === "payment_intent.canceled"
      ) {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await this.handlePaymentIntentFailed(paymentIntent);
      } else if (event.type === "charge.refunded") {
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
      } else if (event.type === "charge.dispute.created") {
        await this.handleDispute(event.data.object as Stripe.Dispute, "OPENED");
      } else if (event.type === "charge.dispute.closed") {
        await this.handleDispute(event.data.object as Stripe.Dispute, "CLOSED");
      } else if (event.type === "account.updated") {
        await this.handleAccountUpdated(event.data.object as Stripe.Account);
      }

      // Mark as completed
      await this.prisma.paymentProviderEvent.update({
        where: { id: providerEvent.id },
        data: {
          processingState: "COMPLETED",
          processedAt: new Date(),
          errorState: null,
        },
      });
    } catch (error: any) {
      this.logger.error(
        `Error processing webhook event ${event.id}: ${error.message}`,
      );
      await this.prisma.paymentProviderEvent.update({
        where: { id: providerEvent.id },
        data: { processingState: "FAILED", errorState: error.message },
      });
      throw error;
    }
  }

  private async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    // Perform all state transitions in a single atomic transaction
    await this.prisma.$transaction(async (tx) => {
      // Find the payment record
      const payment = await tx.payment.findUnique({
        where: { providerPaymentId: paymentIntent.id },
        include: {
          submission: {
            include: {
              queueEntry: true,
              liveSession: { select: { id: true, station: { select: { hostId: true } } } },
            },
          },
        },
      });

      if (!payment) {
        throw new Error(
          `Payment record not found for PaymentIntent: ${paymentIntent.id}`,
        );
      }

      if (payment.status === PaymentStatus.SETTLED) {
        // Already processed
        return;
      }

      // 1. Mark Payment as SETTLED
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.SETTLED, settledAt: new Date() },
      });

      const destinationAccount =
        (paymentIntent.transfer_data?.destination as string) || "";

      // 2. Create Payment Allocation
      await tx.paymentAllocation.create({
        data: {
          id: generateUuidV7(),
          paymentId: payment.id,
          grossAmountCents: payment.grossAmountCents,
          hostPercentage: 85.0,
          platformPercentage: 15.0,
          hostAmountCents: payment.hostAllocationCents,
          platformGrossAmountCents: payment.platformAllocationCents,
          currency: payment.currency,
          stripeConnectedAccountDest: destinationAccount,
        },
      });

      // 3. Post the balanced ledger transaction for the capture:
      //    gross in, host share passed through to Connect, platform fee kept.
      await postLedgerTransaction(tx, {
        idempotencyKey: `webhook_${paymentIntent.id}_capture`,
        description: `Capture payment ${payment.id}`,
        systemSource: "PAYMENT_CAPTURE",
        paymentId: payment.id,
        lines: [
          { account: "PAYMENT_CLEARING", amountCents: payment.grossAmountCents },
          { account: "HOST_PAYABLE", amountCents: -payment.hostAllocationCents },
          { account: "PLATFORM_COMMISSION", amountCents: -payment.platformAllocationCents },
        ],
      });

      // 4. Record the host's earning (powers the host income page)
      const hostProfileId = payment.submission?.liveSession?.station?.hostId;
      if (hostProfileId) {
        const alreadyRecorded = await tx.hostEarning.findFirst({ where: { paymentId: payment.id } });
        if (!alreadyRecorded) {
          await tx.hostEarning.create({
            data: {
              id: generateUuidV7(),
              hostId: hostProfileId,
              paymentId: payment.id,
              submissionId: payment.submissionId,
              liveSessionId: payment.submission?.liveSession?.id ?? null,
              grossAmountCents: payment.grossAmountCents,
              hostShareCents: payment.hostAllocationCents,
              status: "ALLOCATED_TO_STRIPE",
              allocatedAt: new Date(),
            },
          });
        }
      } else {
        this.logger.error(`No host found for payment ${payment.id}; host earning not recorded`);
      }

      // 5. Activate Submission & Queue Entry
      if (payment.submission && payment.submission.queueEntry) {
        const isUpgrade = paymentIntent.metadata?.upgradeSubmissionId;

        if (isUpgrade) {
          const submission = payment.submission;
          const liveSessionId = submission.liveSessionId;
          const newTierSnapshotId = paymentIntent.metadata.tierSnapshotId;

          // Get target tier details
          const newTier = await tx.livePriorityTierSnapshot.findUnique({
            where: { id: newTierSnapshotId },
          });

          if (!newTier) throw new Error("Target tier not found for upgrade");

          const destinationEntries = await tx.queueEntry.findMany({
            where: {
              liveSessionId,
              priorityRank: newTier.priorityRank,
              status: { in: ["QUEUED", "NEXT"] },
            },
            orderBy: { sortOrder: "asc" },
          });

          const { midpoint: newSortOrder, needsRebalance } =
            this.queueOrderingService.calculateNewSortOrder(
              ReorderIntent.BOTTOM,
              destinationEntries as any,
              undefined,
            );

          // Update Submission to priority
          await tx.submission.update({
            where: { id: submission.id },
            data: {
              isPriority: true,
              priorityTierSnapshotId: newTierSnapshotId,
              currentQueueStatus: QueueStatus.QUEUED,
            },
          });

          if (needsRebalance) {
            const rebalanced =
              this.queueOrderingService.generateRebalanceUpdates([
                ...destinationEntries,
                submission.queueEntry,
              ]);
            for (const update of rebalanced) {
              await tx.queueEntry.update({
                where: { id: update.id },
                data: {
                  sortOrder: update.sortOrder,
                  ...(update.id === submission.queueEntry.id
                    ? {
                        priorityRank: newTier.priorityRank,
                        status: QueueStatus.QUEUED,
                      }
                    : {}),
                },
              });
            }
          } else {
            // Update QueueEntry
            await tx.queueEntry.update({
              where: { id: submission.queueEntry.id },
              data: {
                priorityRank: newTier.priorityRank,
                sortOrder: newSortOrder!,
                status: QueueStatus.QUEUED,
              },
            });
          }

          // Decrement active Free capacity if applicable, but retain historical usage.
          const usage = await tx.userLiveSubmissionUsage.findUnique({
            where: {
              userId_liveSessionId: {
                userId: submission.submittingUserId,
                liveSessionId,
              },
            },
          });

          if (usage) {
            await tx.userLiveSubmissionUsage.update({
              where: { id: usage.id },
              data: {
                paidUsedCount: { increment: 1 },
              },
            });
          }

          await tx.submissionUpgrade.create({
            data: {
              id: generateUuidV7(),
              submissionId: submission.id,
              queueEntryId: submission.queueEntry.id,
              previousTierSnapshotId: submission.priorityTierSnapshotId || null,
              newTierSnapshotId: newTierSnapshotId,
              originalPaymentId: null,
              upgradePaymentId: payment.id,
              previousTotalPaidCents: 0,
              upgradeAmountCents: payment.grossAmountCents,
              newTotalPaidCents: payment.grossAmountCents,
              upgradedByUserId: payment.payingUserId,
            },
          });

          // Queue Audit Event for Upgrade
          await appendQueueEvent(tx, {
              queueEntryId: submission.queueEntry.id,
              liveSessionId,
              actingUserId: payment.payingUserId,
              eventType: "TIER_UPGRADE",
              newState: QueueStatus.QUEUED,
            });
        } else {
          // New Submission
          const submission = payment.submission;
          const liveSessionId = submission.liveSessionId;
          const priorityRank = submission.queueEntry.priorityRank;

          const destinationEntries = await tx.queueEntry.findMany({
            where: {
              liveSessionId,
              priorityRank,
              status: { in: [QueueStatus.QUEUED, QueueStatus.NEXT] },
            },
            orderBy: { sortOrder: "asc" },
          });

          const { midpoint: newSortOrder, needsRebalance } =
            this.queueOrderingService.calculateNewSortOrder(
              ReorderIntent.BOTTOM,
              destinationEntries as any,
              undefined,
            );

          await tx.submission.update({
            where: { id: submission.id },
            data: { currentQueueStatus: QueueStatus.QUEUED },
          });

          if (needsRebalance) {
            const rebalanced =
              this.queueOrderingService.generateRebalanceUpdates([
                ...destinationEntries,
                submission.queueEntry,
              ]);
            for (const update of rebalanced) {
              await tx.queueEntry.update({
                where: { id: update.id },
                data: {
                  sortOrder: update.sortOrder,
                  ...(update.id === submission.queueEntry.id
                    ? { status: QueueStatus.QUEUED }
                    : {}),
                },
              });
            }
          } else {
            await tx.queueEntry.update({
              where: { id: submission.queueEntry.id },
              data: {
                status: QueueStatus.QUEUED,
                sortOrder: newSortOrder!,
              },
            });
          }

          // Queue Audit Event for Submission
          await appendQueueEvent(tx, {
              queueEntryId: submission.queueEntry.id,
              liveSessionId,
              actingUserId: payment.payingUserId,
              eventType: "SUBMIT",
              newState: QueueStatus.QUEUED,
            });
        }

        // Consume active reservation
        await tx.priorityTierReservation.updateMany({
          where: {
            userId: payment.payingUserId,
            trackId: payment.submission.sourceTrackId,
            status: "ACTIVE",
          },
          data: {
            status: "CONSUMED",
            consumedAt: new Date(),
          },
        });

        // Increment queueRevision to notify clients of the change
        await tx.liveSession.update({
          where: { id: payment.submission.liveSessionId },
          data: { queueRevision: { increment: 1 } },
        });
      }
    });
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { providerPaymentId: paymentIntent.id },
        include: {
          submission: {
            include: { queueEntry: true },
          },
        },
      });

      if (!payment || payment.status === PaymentStatus.SETTLED) {
        return;
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failedAt: new Date(),
        },
      });

      if (payment.submission) {
        // Release active reservation
        await tx.priorityTierReservation.updateMany({
          where: {
            userId: payment.payingUserId,
            trackId: payment.submission.sourceTrackId,
            status: "ACTIVE",
          },
          data: {
            status: "RELEASED",
            releasedAt: new Date(),
          },
        });

        const isUpgrade = paymentIntent.metadata?.upgradeSubmissionId;
        if (
          !isUpgrade &&
          payment.submission.currentQueueStatus === QueueStatus.AWAITING_PAYMENT
        ) {
          // Never convert to free line; reject failed paid submission
          await tx.submission.update({
            where: { id: payment.submission.id },
            data: {
              currentQueueStatus: QueueStatus.REJECTED,
            },
          });

          if (payment.submission.queueEntry) {
            await tx.queueEntry.update({
              where: { id: payment.submission.queueEntry.id },
              data: {
                status: QueueStatus.REMOVED,
              },
            });
          }
        }
      }
    });
  }

  /**
   * Refunds are issued from the Stripe dashboard with "reverse transfer" and
   * "refund application fee" on, so the host share and platform fee are both
   * returned in proportion.
   */
  private async handleChargeRefunded(charge: Stripe.Charge) {
    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (!paymentIntentId) return;
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { providerPaymentId: paymentIntentId },
        include: { refunds: true },
      });
      if (!payment) return;
      const known = new Set(payment.refunds.map((r) => r.providerRefundId));
      for (const refund of charge.refunds?.data ?? []) {
        if (refund.status !== "succeeded" || known.has(refund.id)) continue;
        const split = splitPayment(refund.amount);
        const refundId = generateUuidV7();
        await tx.refund.create({
          data: {
            id: refundId,
            paymentId: payment.id,
            providerRefundId: refund.id,
            amountCents: refund.amount,
            hostReversalAmountCents: split.hostCents,
            platformReversalAmountCents: split.platformCents,
            reason: refund.reason ?? null,
            status: "SUCCEEDED",
            processedAt: new Date(refund.created * 1000),
          },
        });
        await postLedgerTransaction(tx, {
          idempotencyKey: `webhook_${refund.id}_refund`,
          description: `Refund ${refund.id} for payment ${payment.id}`,
          systemSource: "REFUND_REVERSAL",
          paymentId: payment.id,
          refundId,
          lines: [
            { account: "PAYMENT_CLEARING", amountCents: -refund.amount },
            { account: "HOST_PAYABLE", amountCents: split.hostCents },
            { account: "PLATFORM_COMMISSION", amountCents: split.platformCents },
          ],
        });
      }
      const refunded = charge.amount_refunded;
      const fully = refunded >= payment.grossAmountCents;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmountCents: refunded,
          status: fully ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
          refundedAt: new Date(),
        },
      });
      if (fully) {
        await tx.hostEarning.updateMany({
          where: { paymentId: payment.id },
          data: { status: "REFUNDED", reversedAt: new Date() },
        });
      }
    });
  }

  private async handleDispute(dispute: Stripe.Dispute, phase: "OPENED" | "CLOSED") {
    const paymentIntentId =
      typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
    if (!paymentIntentId) return;
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { providerPaymentId: paymentIntentId } });
      if (!payment) return;
      await tx.dispute.upsert({
        where: { providerDisputeId: dispute.id },
        create: {
          id: generateUuidV7(),
          paymentId: payment.id,
          providerDisputeId: dispute.id,
          reasonCode: dispute.reason,
          amountCents: dispute.amount,
          status: dispute.status,
        },
        update: { status: dispute.status, resolvedAt: phase === "CLOSED" ? new Date() : undefined },
      });
      if (phase === "OPENED") {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.DISPUTED, disputedAt: new Date(), disputedAmountCents: dispute.amount },
        });
        await tx.hostEarning.updateMany({ where: { paymentId: payment.id }, data: { status: "DISPUTED" } });
      } else {
        const lost = dispute.status === "lost";
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: lost ? PaymentStatus.CHARGEBACK : PaymentStatus.SETTLED },
        });
        await tx.hostEarning.updateMany({
          where: { paymentId: payment.id },
          data: lost ? { status: "REVERSED", reversedAt: new Date() } : { status: "ALLOCATED_TO_STRIPE" },
        });
      }
    });
  }

  /** Host finished (or changed) Stripe Connect onboarding. */
  private async handleAccountUpdated(account: Stripe.Account) {
    // Resolved lazily to avoid a module import cycle (HostModule imports PaymentsModule)
    const { HostService } = await import("../host/host.service");
    const hostService = this.moduleRef.get(HostService, { strict: false });
    const result = await hostService.applyStripeAccountState(account.id, account);
    if (result) await hostService.maybeAutoApprove(result.userId);
  }
}
