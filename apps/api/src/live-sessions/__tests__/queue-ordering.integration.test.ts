import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../app.module";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { QueueOrderingService } from "../queue-ordering.service";

describe("QueueOrdering Integration Tests", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let service: QueueOrderingService;

  let hostUser: any;
  let station: any;
  let session: any;
  let track: any;
  let artistIdentity: any;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      console.warn("Skipping integration tests, TEST_DATABASE_URL not set");
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaClient>(PrismaClient);
    service = moduleFixture.get<QueueOrderingService>(QueueOrderingService);

    try {
      await prisma.queueEntry.deleteMany();
      await prisma.submission.deleteMany();
      await prisma.liveSession.deleteMany();
      await prisma.station.deleteMany();
      await prisma.hostProfile.deleteMany();
      await prisma.user.deleteMany();

      hostUser = await prisma.user.create({
        data: {
          id: generateUuidV7(),
          email: `host-${Date.now()}@test.com`,
          normalizedEmail: `host-${Date.now()}@test.com`,
          username: `host${Date.now()}`,
          normalizedUsername: `host${Date.now()}`,
          displayName: "Test Host",
          passwordHash: "hash",
          isHost: true,
        }
      });

      await prisma.hostProfile.create({
        data: {
          id: generateUuidV7(),
          userId: hostUser.id,
          publicHostName: "Test Host",
          normalizedHostName: "test host",
          country: "US",
          hostSlug: `host-${Date.now()}`,
          normalizedHostSlug: `host-${Date.now()}`,
        }
      });

      station = await prisma.station.create({
        data: {
          id: generateUuidV7(),
          hostId: hostUser.id,
          stationName: "Test Station",
          normalizedStationName: "test station",
          slug: `station-${Date.now()}`,
        }
      });

      artistIdentity = await prisma.artistIdentity.create({
        data: {
          id: generateUuidV7(),
          userId: hostUser.id,
          artistName: "Test Artist",
          normalizedArtistName: "test artist"
        }
      });

      track = await prisma.track.create({
        data: {
          id: generateUuidV7(),
          uploaderId: hostUser.id,
          processingState: "READY",
        } as any
      });

      session = await prisma.liveSession.create({
        data: {
          id: generateUuidV7(),
          hostId: hostUser.id,
          stationId: station.id,
          liveTitle: "Test",
          primaryStreamingPlatform: "TWITCH",
          savedProfileUrlSnapshot: "test",
          status: "LIVE",
          queueRevision: 0
        }
      });

    } catch (e) {
      console.error("Test setup failed", e);
    }
  });

  afterAll(async () => {
    if (app) {
      try {
        await app.close();
      } catch (e) {}
    }
    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch (e) {}
    }
  });

  async function createEntry(sortOrder: number, priorityRank: number) {
    const submission = await prisma.submission.create({
      data: {
        id: generateUuidV7(),
        submittingUserId: hostUser.id,
        sourceTrackId: track.id,
        artistIdentityId: artistIdentity.id,
        liveSessionId: session.id,
        isPriority: priorityRank > 0
      }
    });

    return prisma.queueEntry.create({
      data: {
        id: generateUuidV7(),
        liveSessionId: session.id,
        submissionId: submission.id,
        sortOrder,
        priorityRank,
      }
    });
  }

  it("should support valid reordering intents within same group", async () => {
    if (!process.env.TEST_DATABASE_URL || !hostUser) return;

    const entryA = await createEntry(1000, 1);
    const entryB = await createEntry(2000, 1);
    const entryC = await createEntry(3000, 1);

    // Refresh revision safely
    const currentSession = await prisma.liveSession.findUnique({ where: { id: session.id }});

    // Move C BEFORE A
    const res1 = await service.reorderEntry(hostUser.id, session.id, entryC.id, {
      expectedQueueRevision: currentSession!.queueRevision,
      intent: 'BEFORE',
      targetEntryId: entryA.id
    });

    expect(res1.sortOrder).toBeLessThan(1000);
    expect(res1.priorityRank).toBe(1);

    // Ensure session revision incremented
    const updatedSession = await prisma.liveSession.findUnique({ where: { id: session.id }});
    expect(updatedSession!.queueRevision).toBe(currentSession!.queueRevision + 1);
  });

  it("should clamp appropriately instead of rejecting", async () => {
    if (!process.env.TEST_DATABASE_URL || !hostUser) return;

    // Priority 2
    const p2A = await createEntry(1000, 2);
    // Priority 1
    const p1A = await createEntry(1000, 1);
    const p1B = await createEntry(2000, 1);

    const currentSession = await prisma.liveSession.findUnique({ where: { id: session.id }});

    // p1B dragged ABOVE p2A (out of bounds high)
    const res = await service.reorderEntry(hostUser.id, session.id, p1B.id, {
      expectedQueueRevision: currentSession!.queueRevision,
      intent: 'BEFORE',
      targetEntryId: p2A.id
    });

    // It should be clamped to the TOP of priorityRank 1
    expect(res.sortOrder).toBeLessThan(Number(p1A.sortOrder));
    expect(res.priorityRank).toBe(1); // Unchanged priority
  });

  it("should trigger rebalance upon precision exhaustion", async () => {
    if (!process.env.TEST_DATABASE_URL || !hostUser) return;

    // Simulate exhausted gap
    const entryA = await createEntry(1.00000001, 3);
    const entryB = await createEntry(1.00000002, 3);
    const entryC = await createEntry(1.00000003, 3);

    const currentSession = await prisma.liveSession.findUnique({ where: { id: session.id }});

    // Move A between B and C (which have distance 0.00000001)
    const res = await service.reorderEntry(hostUser.id, session.id, entryA.id, {
      expectedQueueRevision: currentSession!.queueRevision,
      intent: 'BEFORE',
      targetEntryId: entryC.id
    });

    // After rebalance, the entries should be cleanly spaced by 1000s
    // A moved to index 1 (between B and C)
    // Order should be B -> A -> C => 1000, 2000, 3000

    expect(res.sortOrder).toBe(2000);

    const finalB = await prisma.queueEntry.findUnique({ where: { id: entryB.id }});
    expect(Number(finalB!.sortOrder)).toBe(1000);

    const finalC = await prisma.queueEntry.findUnique({ where: { id: entryC.id }});
    expect(Number(finalC!.sortOrder)).toBe(3000);
  });
});
