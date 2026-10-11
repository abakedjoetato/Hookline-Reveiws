import { describe, it, expect, vi, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { ModuleRef } from "@nestjs/core";
import { WebhooksService } from "../webhooks.service";
import { PrismaClient, PaymentStatus, QueueStatus } from "@platform/database";
import { QueueOrderingService } from "../../live-sessions/queue-ordering/queue-ordering.service";
import Stripe from "stripe";

describe("WebhooksService", () => {
  let service: WebhooksService;

  const mockPrisma = {
    $transaction: vi.fn(async (cb) => cb(mockPrisma)),
    paymentProviderEvent: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    paymentAllocation: {
      create: vi.fn(),
    },
    ledgerTransaction: {
      create: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    ledgerAccount: {
      findMany: vi.fn().mockResolvedValue([
        { id: "acc1", code: "PAYMENT_CLEARING" },
        { id: "acc2", code: "HOST_PAYABLE" },
        { id: "acc3", code: "PLATFORM_COMMISSION" },
      ]),
    },
    ledgerEntry: {
      createMany: vi.fn(),
    },
    hostEarning: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    queueEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    submission: {
      update: vi.fn(),
    },
    liveSession: {
      update: vi.fn().mockResolvedValue({ lastEventSequence: 1 }),
    },
    queueEvent: {
      create: vi.fn(),
    },
    priorityTierReservation: {
      updateMany: vi.fn(),
    },
    livePriorityTierSnapshot: {
      findUnique: vi.fn(),
    },
    submissionUpgrade: {
      create: vi.fn(),
    },
    userLiveSubmissionUsage: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockQueueOrderingService = {
    calculateNewSortOrder: vi
      .fn()
      .mockReturnValue({ midpoint: 1000, needsRebalance: false }),
    generateRebalanceUpdates: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: QueueOrderingService, useValue: mockQueueOrderingService },
        { provide: ModuleRef, useValue: { get: vi.fn() } },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    vi.clearAllMocks();
  });

  it("should skip already completed events", async () => {
    mockPrisma.paymentProviderEvent.findUnique.mockResolvedValue({
      processingState: "COMPLETED",
    });

    await service.processEvent({ id: "evt_123" } as any, "{}");

    expect(mockPrisma.paymentProviderEvent.upsert).not.toHaveBeenCalled();
  });

  it("should process payment_intent.succeeded for new submission", async () => {
    mockPrisma.paymentProviderEvent.findUnique.mockResolvedValue(null);
    mockPrisma.paymentProviderEvent.upsert.mockResolvedValue({ id: "event_1" });

    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay_1",
      status: "CREATED",
      grossAmountCents: 1000,
      hostAllocationCents: 850,
      platformAllocationCents: 150,
      currency: "USD",
      submissionId: "sub_1",
      submission: {
        id: "sub_1",
        liveSessionId: "ls_1",
        queueEntry: { id: "qe_1", priorityRank: 5 },
        liveSession: { id: "ls_1", station: { hostId: "host_profile_1" } },
      },
    });

    const event = {
      id: "evt_123",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_123",
          transfer_data: { destination: "acct_123" },
        },
      },
    } as any;

    await service.processEvent(event, "{}");

    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.SETTLED }),
      }),
    );
    expect(mockPrisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentQueueStatus: QueueStatus.QUEUED,
        }),
      }),
    );
    expect(mockPrisma.queueEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: QueueStatus.QUEUED,
          sortOrder: 1000,
        }),
      }),
    );
    expect(mockPrisma.liveSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ queueRevision: { increment: 1 } }),
      }),
    );
  });

  it("should handle needsRebalance logic when calculating placement", async () => {
    mockPrisma.paymentProviderEvent.findUnique.mockResolvedValue(null);
    mockPrisma.paymentProviderEvent.upsert.mockResolvedValue({ id: "event_1" });

    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay_1",
      status: "CREATED",
      grossAmountCents: 1000,
      hostAllocationCents: 850,
      platformAllocationCents: 150,
      currency: "USD",
      submissionId: "sub_1",
      submission: {
        id: "sub_1",
        liveSessionId: "ls_1",
        queueEntry: { id: "qe_1", priorityRank: 5 },
        liveSession: { id: "ls_1", station: { hostId: "host_profile_1" } },
      },
    });

    mockQueueOrderingService.calculateNewSortOrder.mockReturnValueOnce({
      midpoint: 1000,
      needsRebalance: true,
    });
    mockQueueOrderingService.generateRebalanceUpdates.mockReturnValueOnce([
      { id: "qe_1", sortOrder: 1000 },
    ]);

    const event = {
      id: "evt_123",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_123",
          transfer_data: { destination: "acct_123" },
        },
      },
    } as any;

    await service.processEvent(event, "{}");

    expect(
      mockQueueOrderingService.generateRebalanceUpdates,
    ).toHaveBeenCalled();
    expect(mockPrisma.queueEntry.update).toHaveBeenCalled();
  });
});
