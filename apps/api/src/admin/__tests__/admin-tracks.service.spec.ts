import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminTracksService } from "../admin-tracks.service";
import { StorageStatus } from "@platform/types";

describe("AdminTracksService", () => {
  let service: AdminTracksService;

  const mockPrisma = {
    track: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    trackMediaVersion: {
      updateMany: vi.fn(),
    },
    trackArtwork: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(cb => cb(mockPrisma)),
  };

  const mockQueueService = {
    enqueueDeleteMediaObjects: vi.fn(),
    enqueueDeleteUserMedia: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminTracksService(mockPrisma as any, mockQueueService as any);
  });

  describe("getAdminTracks", () => {
    it("should map Prisma response to DTO and apply sorting", async () => {
      const mockTrack = {
        id: "track1",
        songName: "Test Song",
        processingState: "READY",
        createdAt: new Date(),
        lastPlayedAt: new Date(),
        artistIdentity: { artistName: "Artist1" },
        user: { id: "user1", username: "user1" },
        mediaVersions: [{ fileSize: 1000, storageStatus: StorageStatus.AVAILABLE }]
      };

      mockPrisma.track.findMany.mockResolvedValue([mockTrack]);

      const result = await service.getAdminTracks({ sortBy: "lastPlayedDesc" });

      expect(result.length).toBe(1);
      expect(result[0].fileSize).toBe(1000);
      expect(result[0].title).toBe("Test Song");
      expect(mockPrisma.track.findMany).toHaveBeenCalledWith(expect.objectContaining({
        orderBy: { lastPlayedAt: "desc" }
      }));
    });

    it("should filter by neverPlayed", async () => {
      mockPrisma.track.findMany.mockResolvedValue([]);
      await service.getAdminTracks({ neverPlayed: true });

      expect(mockPrisma.track.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          lastPlayedAt: null
        })
      }));
    });
  });

  describe("deleteTrackMedia", () => {
    it("should update DB status and enqueue deletion job", async () => {
      const mockTrack = {
        id: "track1",
        mediaVersions: [{ id: "m1", originalObjectKey: "o1", storageStatus: StorageStatus.AVAILABLE }],
        artworks: [{ id: "a1", originalObjectKey: "o2", storageStatus: StorageStatus.AVAILABLE }]
      };
      mockPrisma.track.findUnique.mockResolvedValue(mockTrack);

      const res = await service.deleteTrackMedia("track1");

      expect(res.success).toBe(true);
      expect(res.pendingDeletions).toBe(2);
      expect(mockPrisma.trackMediaVersion.updateMany).toHaveBeenCalled();
      expect(mockPrisma.trackArtwork.updateMany).toHaveBeenCalled();
      expect(mockQueueService.enqueueDeleteMediaObjects).toHaveBeenCalledWith({
        objectKeys: ["o1", "o2"]
      });
    });
  });
});
