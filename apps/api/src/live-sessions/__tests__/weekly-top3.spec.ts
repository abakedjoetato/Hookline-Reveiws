import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveSessionsService } from "../live-sessions.service";
import { getCurrentWeeklyPeriod } from "@platform/config";
import { buildPlayTrackKey, selectCountedPlays } from "../play-counting";

describe("Weekly Top 3 & Period Boundaries", () => {
  describe("getCurrentWeeklyPeriod (America/New_York Saturday 00:00 reset)", () => {
    it("should correctly identify current period start and end across Saturday boundary", () => {
      // 2026-03-07 was a Saturday
      // 2026-03-06 23:59:00 NY time is Friday before midnight
      // 2026-03-07 00:00:00 NY time is Saturday reset
      // In early March before DST (standard time UTC-5):
      // 2026-03-06 23:59:00 NY is 2026-03-07T04:59:00Z
      // 2026-03-07 00:01:00 NY is 2026-03-07T05:01:00Z

      const fridayNightUtc = new Date("2026-03-07T04:59:00Z");
      const saturdayMorningUtc = new Date("2026-03-07T05:01:00Z");

      const periodFriday = getCurrentWeeklyPeriod(fridayNightUtc);
      const periodSaturday = getCurrentWeeklyPeriod(saturdayMorningUtc);

      // Period Friday started on Saturday Feb 28
      expect(periodFriday.startDate.toISOString()).toBe("2026-02-28T05:00:00.000Z");
      expect(periodFriday.endDate.toISOString()).toBe("2026-03-07T05:00:00.000Z");

      // Period Saturday started on Saturday Mar 7
      expect(periodSaturday.startDate.toISOString()).toBe("2026-03-07T05:00:00.000Z");
      // Mar 7 to Mar 14 (crosses DST on Mar 8, so end is 2026-03-14T04:00:00Z EDT UTC-4)
      expect(periodSaturday.endDate.toISOString()).toBe("2026-03-14T04:00:00.000Z");
    });
  });

  describe("LiveSessionsService.getWeeklyTop3 Aggregation & Rate Limiting", () => {
    let service: LiveSessionsService;

    const mockPrisma = {
      station: {
        findFirst: vi.fn(),
      },
      liveSession: {
        findUnique: vi.fn(),
      },
      queueEntry: {
        findMany: vi.fn(),
      },
      playbackEvent: {
        create: vi.fn(),
      },
    };

    const mockEventService = {
      emit: vi.fn(),
    };

    const mockQueueOrderingService = {};

    beforeEach(() => {
      vi.clearAllMocks();
      service = new LiveSessionsService(
        mockPrisma as any,
        mockQueueOrderingService as any,
        mockEventService as any,
      );
    });

    it("counts only the stored counted plays for the station", async () => {
      const stationId = "station-uuid-1";
      const referenceDate = new Date("2026-03-10T12:00:00Z"); // Tuesday

      mockPrisma.station.findFirst.mockResolvedValue({
        id: stationId,
        stationName: "The Jazz Station",
        slug: "the-jazz-station",
        host: { user: { displayName: "DJ Miles" } },
      });

      const played = (id: string, at: string, track: string, song: string, isPriority = false) => ({
        id,
        countedAsPlay: true,
        countedPlayAt: new Date(at),
        completedAt: new Date(at),
        submission: {
          isPriority,
          sourceTrackId: track,
          trackSnapshot: { songName: song, artistName: "Miles Davis" },
        },
      });

      mockPrisma.queueEntry.findMany.mockResolvedValue([
        played("a1", "2026-03-08T10:00:00Z", "track-a", "Blue in Green"),
        played("a2", "2026-03-08T15:00:00Z", "track-a", "Blue in Green"),
        played("b1", "2026-03-08T09:00:00Z", "track-b", "So What", true),
        played("b2", "2026-03-08T14:00:00Z", "track-b", "So What"),
        played("b3", "2026-03-08T19:00:00Z", "track-b", "So What", true),
      ]);

      const result = await service.getWeeklyTop3(stationId, referenceDate);

      const where = mockPrisma.queueEntry.findMany.mock.calls[0][0].where;
      expect(where.countedAsPlay).toBe(true);
      expect(where.liveSession.stationId).toBe(stationId);

      expect(result.items.map((i) => [i.songName, i.qualifyingPlayCount])).toEqual([
        ["So What", 3],
        ["Blue in Green", 2],
      ]);
    });

    it("applies deterministic tie-breaking (count DESC, recent DESC, id ASC) and caps at Top 3", async () => {
      const stationId = "station-uuid-1";
      const referenceDate = new Date("2026-03-10T12:00:00Z");

      mockPrisma.station.findFirst.mockResolvedValue({
        id: stationId,
        stationName: "The Rock Station",
        slug: "the-rock-station",
        host: {
          user: { displayName: "DJ Rock" },
        },
      });

      // 4 songs with 1 qualifying play each, different timestamps
      mockPrisma.queueEntry.findMany.mockResolvedValue([
        {
          id: "qe-1",
          countedAsPlay: true,
          countedPlayAt: new Date("2026-03-08T10:00:00Z"),
          submission: {
            isPriority: false,
            sourceTrackId: "track-1",
            trackSnapshot: { songName: "Song 1", artistName: "Artist A" },
          },
        },
        {
          id: "qe-2",
          countedAsPlay: true,
          countedPlayAt: new Date("2026-03-08T15:00:00Z"), // Most recent
          submission: {
            isPriority: false,
            sourceTrackId: "track-2",
            trackSnapshot: { songName: "Song 2", artistName: "Artist B" },
          },
        },
        {
          id: "qe-3",
          countedAsPlay: true,
          countedPlayAt: new Date("2026-03-08T12:00:00Z"), // Second most recent
          submission: {
            isPriority: false,
            sourceTrackId: "track-3",
            trackSnapshot: { songName: "Song 3", artistName: "Artist C" },
          },
        },
        {
          id: "qe-4",
          countedAsPlay: true,
          countedPlayAt: new Date("2026-03-08T11:00:00Z"), // Third most recent
          submission: {
            isPriority: false,
            sourceTrackId: "track-4",
            trackSnapshot: { songName: "Song 4", artistName: "Artist D" },
          },
        },
      ]);

      const result = await service.getWeeklyTop3(stationId, referenceDate);

      // Capped at 3 items
      expect(result.items.length).toBe(3);

      // Rank 1: Song 2 (15:00)
      expect(result.items[0].songName).toBe("Song 2");
      expect(result.items[0].rank).toBe(1);

      // Rank 2: Song 3 (12:00)
      expect(result.items[1].songName).toBe("Song 3");
      expect(result.items[1].rank).toBe(2);

      // Rank 3: Song 4 (11:00)
      expect(result.items[2].songName).toBe("Song 4");
      expect(result.items[2].rank).toBe(3);
    });
  });

  describe("Play counting rule (once per track, per host, per 4 hours)", () => {
    const at = (h: number, m = 0) => new Date(Date.UTC(2026, 2, 8, h, m));

    it("counts the first play and ignores replays inside the 4-hour window", () => {
      expect(selectCountedPlays([at(10), at(11), at(13, 59)])).toEqual([true, false, false]);
    });

    it("counts again once 4 hours have passed since the last counted play", () => {
      expect(selectCountedPlays([at(10), at(14), at(15), at(18)])).toEqual([true, true, false, true]);
    });

    it("measures the window from the last counted play, not the last play", () => {
      // 10:00 counted, 13:00 ignored, 14:00 counts (4h after 10:00, not 13:00)
      expect(selectCountedPlays([at(10), at(13), at(14)])).toEqual([true, false, true]);
    });

    it("builds stable track keys for library tracks and external links", () => {
      expect(buildPlayTrackKey({ sourceTrackId: "abc" })).toBe("track:abc");
      expect(buildPlayTrackKey({ songName: "  So  What ", artistName: "Miles DAVIS" })).toBe(
        buildPlayTrackKey({ songName: "so what", artistName: "miles davis" }),
      );
    });
  });
});
