import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { LiveSessionsService } from "../live-sessions.service";
import { QueueOrderingService } from "../queue-ordering.service";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import {
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  LiveSessionStatus,
  StreamingPlatform,
  QueueStatus,
} from "@platform/types";

describe("LiveSessionsService", () => {
  let service: LiveSessionsService;
  let prisma: PrismaClient;

  // Use a transaction testing approach for tests touching the real database
  let dbTransaction: any;

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
        {
          provide: QueueOrderingService,
          useValue: {}, // Mock QueueOrderingService
        },
        {
          provide: PrismaClient,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<LiveSessionsService>(LiveSessionsService);
  });

  describe("createLiveSession", () => {
    it("should create a live session for an authenticated host", async () => {
      // Need real DB records for host, station etc to fully test.
      // We will rely on e2e tests for complete database interactions to avoid heavy mocking here
      // or write integration tests in a separate suite. For this foundational slice,
      // we'll mock the Prisma calls for pure unit testing of business logic.
      const mockHostId = generateUuidV7();
      const mockStationId = generateUuidV7();

      const prismaMock = {
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback(prismaMock);
        }),
        $queryRaw: vi.fn().mockResolvedValue([{ id: "host-id" }]),
        hostProfile: {
          findUnique: vi.fn().mockResolvedValue({ userId: mockHostId }),
        },
        station: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: mockStationId, hostId: mockHostId }),
        },
        liveSession: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "new-session",
            hostId: mockHostId,
            stationId: mockStationId,
            status: LiveSessionStatus.PREPARING,
            liveTitle: "My Session",
            queueRevision: 0,
          }),
        },
      };

      const mockQueueOrderingService = {
        // Mock queue ordering service methods if needed for other tests
      };

      const mockService = new LiveSessionsService(
        prismaMock as any,
        mockQueueOrderingService as any,
      );

      const result = await mockService.createLiveSession(mockHostId, {
        stationId: mockStationId,
        liveTitle: "My Session",
        primaryStreamingPlatform: StreamingPlatform.TWITCH,
        savedProfileUrlSnapshot: "http://twitch.tv/myprofile",
      });

      expect(result.id).toBe("new-session");
      expect(prismaMock.liveSession.create).toHaveBeenCalled();
    });

    it("should throw ForbiddenException if user is not a host", async () => {
      const prismaMock = {
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback(prismaMock);
        }),
        $queryRaw: vi.fn().mockResolvedValue([]),
        hostProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      };
      const mockQueueOrderingService = {};
      const mockService = new LiveSessionsService(
        prismaMock as any,
        mockQueueOrderingService as any,
      );

      await expect(
        mockService.createLiveSession(generateUuidV7(), {
          stationId: generateUuidV7(),
          liveTitle: "My Session",
          primaryStreamingPlatform: StreamingPlatform.TWITCH,
          savedProfileUrlSnapshot: "http://twitch.tv/myprofile",
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
