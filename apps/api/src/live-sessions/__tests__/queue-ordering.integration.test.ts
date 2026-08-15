import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
  beforeEach,
} from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { LiveSessionsService } from "../live-sessions.service";
import { QueueOrderingService } from "../queue-ordering.service";
import { ReorderIntent } from "../dto/live-session.dto";
import { QueueStatus } from "@platform/types";

describe("Queue Ordering Service & Integration", () => {
  let prisma: PrismaClient;
  let liveSessionsService: LiveSessionsService;
  let queueOrderingService: QueueOrderingService;

  beforeAll(async () => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveSessionsService,
        QueueOrderingService,
        {
          provide: PrismaClient,
          useValue: prisma,
        },
      ],
    }).compile();

    liveSessionsService = module.get<LiveSessionsService>(LiveSessionsService);
    queueOrderingService =
      module.get<QueueOrderingService>(QueueOrderingService);

    vi.restoreAllMocks();
  });

  describe("QueueOrderingService (Unit)", () => {
    it("should calculate midpoints accurately up to 8 decimals", () => {
      const mid = queueOrderingService.calculateMidpoint("1000", "2000");
      expect(mid.toString()).toBe("1500");

      const tinyMid = queueOrderingService.calculateMidpoint(
        "1000.00000001",
        "1000.00000003",
      );
      expect(tinyMid.toString()).toBe("1000.00000002");
    });

    it("should detect precision exhaustion", () => {
      // gap exactly 0.00000001
      expect(
        queueOrderingService.isSpaceExhausted("1000.00000001", "1000.00000002"),
      ).toBe(true);
      // gap > 0.00000001
      expect(
        queueOrderingService.isSpaceExhausted("1000.00000001", "1000.00000003"),
      ).toBe(false);
    });

    it("should clamp intents correctly based on priority boundaries", () => {
      // Same priority -> no clamp
      expect(
        queueOrderingService.clampIntent(
          { priorityRank: 1 },
          { priorityRank: 1 },
          ReorderIntent.BEFORE,
        ).clamped,
      ).toBe(false);

      // Moving priority 0 entry above priority 1 entry -> clamp to top
      const clampUp = queueOrderingService.clampIntent(
        { priorityRank: 0 },
        { priorityRank: 1 },
        ReorderIntent.BEFORE,
      );
      expect(clampUp.clamped).toBe(true);
      expect(clampUp.intent).toBe(ReorderIntent.TOP);

      // Moving priority 1 entry below priority 0 entry -> clamp to bottom
      const clampDown = queueOrderingService.clampIntent(
        { priorityRank: 1 },
        { priorityRank: 0 },
        ReorderIntent.AFTER,
      );
      expect(clampDown.clamped).toBe(true);
      expect(clampDown.intent).toBe(ReorderIntent.BOTTOM);
    });

    it("should generate rebalance updates with 1000 spacing", () => {
      const updates = queueOrderingService.generateRebalanceUpdates([
        { id: "a" },
        { id: "b" },
      ]);
      expect(updates[0].sortOrder.toString()).toBe("1000");
      expect(updates[1].sortOrder.toString()).toBe("2000");
    });

    it("should detect no-ops", () => {
      const group: any[] = [
        { id: "a", sortOrder: "1000" },
        { id: "b", sortOrder: "2000" },
        { id: "c", sortOrder: "3000" },
      ];

      // Moved "a" to TOP -> no-op
      expect(queueOrderingService.isNoOp("a", ReorderIntent.TOP, group)).toBe(
        true,
      );
      // Moved "b" BEFORE "c" -> no-op
      expect(
        queueOrderingService.isNoOp("b", ReorderIntent.BEFORE, group, "c"),
      ).toBe(true);
      // Moved "b" AFTER "a" -> no-op
      expect(
        queueOrderingService.isNoOp("b", ReorderIntent.AFTER, group, "a"),
      ).toBe(true);
      // Moved "c" to BOTTOM -> no-op
      expect(
        queueOrderingService.isNoOp("c", ReorderIntent.BOTTOM, group),
      ).toBe(true);

      // Moved "c" BEFORE "a" -> NOT no-op
      expect(
        queueOrderingService.isNoOp("c", ReorderIntent.BEFORE, group, "a"),
      ).toBe(false);
    });
  });

  describe("Reorder Endpoint Logic (Service Integration)", () => {
    it("should reorder and increment revision exactly once", async () => {
      const mockHostId = generateUuidV7();
      const mockSessionId = generateUuidV7();
      const entryIdA = "entryA";
      const entryIdB = "entryB";

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        return callback(prisma);
      });

      vi.spyOn(prisma, "$queryRaw").mockResolvedValue([
        { id: mockSessionId, hostId: mockHostId, queueRevision: 0 },
      ]);

      const mockQueueEntryFindUnique = vi.spyOn(
        prisma.queueEntry,
        "findUnique",
      );
      mockQueueEntryFindUnique.mockImplementation((({ where }: any) => {
        if (where.id === entryIdB) {
          return Promise.resolve({
            id: entryIdB,
            liveSessionId: mockSessionId,
            status: QueueStatus.QUEUED,
            priorityRank: 0,
          });
        }
        if (where.id === entryIdA) {
          return Promise.resolve({
            id: entryIdA,
            liveSessionId: mockSessionId,
            status: QueueStatus.QUEUED,
            priorityRank: 0,
          });
        }
        return Promise.resolve(null);
      }) as any);

      vi.spyOn(prisma.queueEntry, "findMany").mockResolvedValue([
        { id: entryIdA, sortOrder: "1000", priorityRank: 0 },
        { id: entryIdB, sortOrder: "2000", priorityRank: 0 },
      ] as any);

      const updateSpy = vi
        .spyOn(prisma.queueEntry, "update")
        .mockResolvedValue({} as any);
      const sessionUpdateSpy = vi
        .spyOn(prisma.liveSession, "update")
        .mockResolvedValue({} as any);

      // We want to move B before A. New sortOrder should be 1000 - 1000 = 0
      await liveSessionsService.reorderQueueEntry(
        mockHostId,
        mockSessionId,
        entryIdB,
        {
          expectedQueueRevision: 0,
          intent: ReorderIntent.BEFORE,
          targetEntryId: entryIdA,
        },
      );

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: entryIdB },
        data: { sortOrder: expect.anything() },
      });
      // Ensure revision incremented once
      expect(sessionUpdateSpy).toHaveBeenCalledWith({
        where: { id: mockSessionId, queueRevision: 0 },
        data: { queueRevision: { increment: 1 } },
      });
    });

    it("should detect no-op and NOT increment revision", async () => {
      const mockHostId = generateUuidV7();
      const mockSessionId = generateUuidV7();
      const entryIdA = "entryA";
      const entryIdB = "entryB";

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        return callback(prisma);
      });

      vi.spyOn(prisma, "$queryRaw").mockResolvedValue([
        { id: mockSessionId, hostId: mockHostId, queueRevision: 0 },
      ]);

      const mockQueueEntryFindUnique = vi.spyOn(
        prisma.queueEntry,
        "findUnique",
      );
      mockQueueEntryFindUnique.mockImplementation((({ where }: any) => {
        if (where.id === entryIdA) {
          return Promise.resolve({
            id: entryIdA,
            liveSessionId: mockSessionId,
            status: QueueStatus.QUEUED,
            priorityRank: 0,
          });
        }
        return Promise.resolve(null);
      }) as any);

      vi.spyOn(prisma.queueEntry, "findMany").mockResolvedValue([
        { id: entryIdA, sortOrder: "1000", priorityRank: 0 },
        { id: entryIdB, sortOrder: "2000", priorityRank: 0 },
      ] as any);

      const updateSpy = vi.spyOn(prisma.queueEntry, "update");
      const sessionUpdateSpy = vi.spyOn(prisma.liveSession, "update");

      // Move A to TOP when it's already at the TOP -> no-op
      await liveSessionsService.reorderQueueEntry(
        mockHostId,
        mockSessionId,
        entryIdA,
        {
          expectedQueueRevision: 0,
          intent: ReorderIntent.TOP,
        },
      );

      expect(updateSpy).not.toHaveBeenCalled();
      expect(sessionUpdateSpy).not.toHaveBeenCalled();
    });
  });
});
