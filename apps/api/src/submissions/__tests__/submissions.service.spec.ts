import { describe, it, expect, vi, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { SubmissionsService } from "../submissions.service";
import { SubmissionEligibilityService } from "../submission-eligibility.service";
import { QueueOrderingService } from "../../live-sessions/queue-ordering/queue-ordering.service";
import { PrismaClient } from "@platform/database";
import { ConflictException } from "@nestjs/common";

describe("SubmissionsService", () => {
  let service: SubmissionsService;
  let eligibilityService: SubmissionEligibilityService;

  const mockPrisma = {
    $transaction: vi.fn(async (cb) => {
      return cb(mockPrisma);
    }),
    userLiveSubmissionUsage: { upsert: vi.fn() },
    submission: { create: vi.fn().mockResolvedValue({ id: "sub_1" }) },
    queueEntry: { create: vi.fn().mockResolvedValue({ id: "qe_1" }), findMany: vi.fn().mockResolvedValue([]) },
  };

  const mockEligibilityService = {
    getEligibility: vi.fn(),
  };

  const mockQueueOrderingService = {
    calculateNewSortOrder: vi.fn().mockReturnValue({ midpoint: 0 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: SubmissionEligibilityService, useValue: mockEligibilityService },
        { provide: QueueOrderingService, useValue: mockQueueOrderingService },
      ],
    }).compile();

    service = module.get<SubmissionsService>(SubmissionsService);
    eligibilityService = module.get<SubmissionEligibilityService>(SubmissionEligibilityService);
    vi.clearAllMocks();
  });

  it("should block free submission if eligibility fails", async () => {
    mockEligibilityService.getEligibility.mockResolvedValue({
      free: { available: false, reason: "SOME_REASON" },
      priorityTiers: [],
    });

    await expect(service.createSubmission("user_1", "ls_1", {
      sourceTrackId: "tr_1",
      artistIdentityId: "art_1",
    })).rejects.toThrow(ConflictException);
  });

  it("should create free submission if eligible", async () => {
    mockEligibilityService.getEligibility.mockResolvedValue({
      free: { available: true },
      priorityTiers: [],
    });

    const result = await service.createSubmission("user_1", "ls_1", {
      sourceTrackId: "tr_1",
      artistIdentityId: "art_1",
    });

    expect(mockPrisma.userLiveSubmissionUsage.upsert).toHaveBeenCalled();
    expect(mockPrisma.submission.create).toHaveBeenCalled();
    expect(mockPrisma.queueEntry.create).toHaveBeenCalled();
    expect(result.submission.id).toBe("sub_1");
  });

  it("should create unpaid priority submission if eligible", async () => {
    mockEligibilityService.getEligibility.mockResolvedValue({
      free: { available: true },
      priorityTiers: [
        { tierSnapshotId: "ts_1", available: true, priorityRank: 5 },
      ],
    });

    const result = await service.createSubmission("user_1", "ls_1", {
      sourceTrackId: "tr_1",
      artistIdentityId: "art_1",
      tierSnapshotId: "ts_1",
    });

    expect(mockPrisma.submission.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        isPriority: true,
        priorityTierSnapshotId: "ts_1",
        currentQueueStatus: "AWAITING_PAYMENT",
      }),
    }));
    expect(mockPrisma.queueEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "AWAITING_PAYMENT",
        priorityRank: 5,
      }),
    }));
    expect(result.submission.id).toBe("sub_1");
  });
});
