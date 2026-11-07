import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { LiveSessionStatus, QueueStatus } from "@platform/types";
import { PublicService } from "../public.service";
import {
  DEFAULT_THEME_TOKENS,
  SITE_CUSTOMIZATION_ID,
  SiteCustomizationService,
} from "../site-customization.service";

const now = new Date("2026-11-07T12:00:00Z");

const customizationRow = {
  id: SITE_CUSTOMIZATION_ID,
  siteName: "TheQueue",
  primaryLogoUrl: null,
  alternateLogoUrl: null,
  faviconUrl: null,
  customCss: null,
  updatedByUserId: null,
  createdAt: now,
  updatedAt: now,
  ...DEFAULT_THEME_TOKENS,
};

const station = {
  id: "station-1",
  hostId: "host-1",
  stationName: "Night Shift",
  normalizedStationName: "night shift",
  slug: "nightshift",
  description: null,
  profileImageKey: null,
  bannerImageKey: null,
  status: "ACTIVE",
  isPublicVisible: true,
  primaryStreamingPlatform: "TWITCH",
  streamUrl: null,
  acceptedContentRules: null,
  explicitContentAllowed: true,
  maxTrackDurationSeconds: 600,
  maxQueueSize: 100,
  showCurrentTrackPublicly: true,
  showSongNamePublicly: true,
  showArtistNamePublicly: false,
  showTierPublicly: true,
  createdAt: now,
  updatedAt: now,
  host: { id: "host-1", publicHostName: "DJ Night", biography: "hi", isApproved: true },
};

describe("PublicService", () => {
  const prisma = {
    station: { findFirst: vi.fn(), findMany: vi.fn() },
    hostProfile: { findUnique: vi.fn() },
    hostSlugHistory: { findFirst: vi.fn() },
    liveSession: { findFirst: vi.fn(), findMany: vi.fn() },
    queueEntry: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
  };
  const host = {
    toStationSummary: vi.fn((s: any, h: any, live: any) => ({
      id: s.id,
      hostName: h.publicHostName,
      isLive: Boolean(live),
    })),
  };
  const liveSessions = {
    getPublicLiveSession: vi.fn(),
    getWeeklyTop3: vi.fn(),
  };
  const customization = {
    getPublic: vi.fn(async () => ({ tokens: DEFAULT_THEME_TOKENS })),
  };
  let service: PublicService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PublicService(
      prisma as any,
      host as any,
      liveSessions as any,
      customization as any,
    );
  });

  it("rejects malformed hostnames without querying the database", async () => {
    await expect(service.getStation("../etc")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.station.findFirst).not.toHaveBeenCalled();
  });

  it("follows an active slug redirect to the host's current station", async () => {
    prisma.station.findFirst
      .mockResolvedValueOnce(null) // by slug
      .mockResolvedValueOnce(station); // host's first station
    prisma.hostProfile.findUnique.mockResolvedValue(null);
    prisma.hostSlugHistory.findFirst.mockResolvedValue({ hostId: "host-1" });
    prisma.liveSession.findFirst.mockResolvedValue(null);

    const result = await service.getStation("OldName");

    expect(prisma.station.findFirst.mock.calls[0][0].where.slug).toBe("oldname");
    expect(result).toMatchObject({
      id: "station-1",
      hostname: "nightshift",
      hostName: "DJ Night",
      isLive: false,
      currentSession: null,
    });
  });

  it("includes the current session when the station is on air", async () => {
    prisma.station.findFirst.mockResolvedValueOnce(station);
    prisma.liveSession.findFirst.mockResolvedValue({ id: "live-1", currentQueueEntryId: null });
    liveSessions.getPublicLiveSession.mockResolvedValue({ id: "live-1" });

    const result = await service.getStation("nightshift");

    expect(liveSessions.getPublicLiveSession).toHaveBeenCalledWith("live-1");
    expect(result.isLive).toBe(true);
    expect(result.currentSession).toEqual({ id: "live-1" });
  });

  it("lists live stations first", async () => {
    prisma.station.findMany.mockResolvedValue([
      { ...station, id: "a" },
      { ...station, id: "b" },
    ]);
    prisma.liveSession.findMany.mockResolvedValue([{ id: "live-b", stationId: "b" }]);

    const result = await service.listStations();

    expect(result.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("rejects an invalid weekly-top3 date", async () => {
    prisma.station.findFirst.mockResolvedValueOnce(station);
    await expect(service.getWeeklyTop3("nightshift", "not-a-date")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("masks overlay fields the station hides publicly", async () => {
    prisma.station.findFirst.mockResolvedValueOnce(station);
    prisma.liveSession.findFirst.mockResolvedValue({
      id: "live-1",
      currentQueueEntryId: "entry-1",
      status: LiveSessionStatus.LIVE,
    });
    prisma.queueEntry.findUnique.mockResolvedValue({
      id: "entry-1",
      liveSessionId: "live-1",
      status: QueueStatus.PLAYING,
      sortOrder: 1,
      priorityRank: 0,
      submission: {
        isPriority: false,
        submittedAt: now,
        artistIdentityId: "artist-1",
        artistIdentity: { spotifyUrl: "https://open.spotify.com/artist/x" },
        trackSnapshot: { songName: "Song", artistName: "Secret Artist", durationSeconds: 200 },
        sourceTrack: null,
        priorityTierSnapshot: null,
      },
    });

    const overlay = await service.getOverlay("nightshift");

    expect(overlay.isLive).toBe(true);
    expect(overlay.theme.accentColor).toBe(DEFAULT_THEME_TOKENS.accentColor);
    expect(overlay.nowPlaying).toMatchObject({
      songName: "Song",
      artistName: "Hidden",
      spotifyUrl: null,
      tierName: "Free Line",
    });
  });

  it("returns 404 for an unknown or hidden user", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.getProfile("nobody")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("builds a public profile from public tracks and identities only", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      username: "Tayer",
      displayName: "Tayer",
      createdAt: now,
      profile: { biography: "bio", avatarUrl: null, country: "CA", websiteUrl: null, spotifyProfileUrl: null },
      artistIdentities: [{ id: "artist-1", artistName: "Emerald", spotifyUrl: null, biography: null }],
      tracks: [
        {
          id: "track-1",
          userId: "user-1",
          songName: "Track",
          albumName: null,
          explicitContent: false,
          bpm: null,
          musicalKey: null,
          durationSeconds: 180,
          processingState: "READY",
          isPublic: true,
          createdAt: now,
          updatedAt: now,
          artistIdentity: { id: "artist-2", artistName: "Private", isPublic: false, deletedAt: null },
          genres: [{ genre: { name: "Rock" } }, { genre: { name: "Pop" } }],
        },
      ],
    });

    const profile = await service.getProfile("TAYER");

    expect(prisma.user.findFirst.mock.calls[0][0].where.normalizedUsername).toBe("tayer");
    expect(profile.genres).toEqual(["Pop", "Rock"]);
    expect(profile.publicTracks[0].artistIdentity).toBeNull();
    expect(profile.stats).toMatchObject({ publicTracksCount: 1, artistIdentitiesCount: 1 });
  });
});

describe("SiteCustomizationService", () => {
  const prisma = {
    siteCustomization: { upsert: vi.fn(), update: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const storage = {
    createPresignedUpload: vi.fn(),
    createPresignedDownload: vi.fn(),
    verifyObjectExists: vi.fn(),
  };
  let service: SiteCustomizationService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.siteCustomization.upsert.mockResolvedValue(customizationRow);
    prisma.siteCustomization.update.mockImplementation(async ({ data }: any) => ({
      ...customizationRow,
      ...data,
    }));
    service = new SiteCustomizationService(prisma as any, storage as any);
  });

  it("returns defaults publicly without admin-only fields", async () => {
    const theme = await service.getPublic();
    expect(theme.tokens).toEqual(DEFAULT_THEME_TOKENS);
    expect(theme).not.toHaveProperty("customCss");
  });

  it("applies token colours, clears URLs and writes an audit entry", async () => {
    const result = await service.update("admin-1", {
      siteName: "  Hookline  ",
      primaryLogoUrl: null,
      tokens: { primaryColor: "#123456", notAToken: "#000000" },
    });

    const data = prisma.siteCustomization.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      siteName: "Hookline",
      primaryLogoUrl: null,
      primaryColor: "#123456",
      updatedByUserId: "admin-1",
    });
    expect(data).not.toHaveProperty("notAToken");
    expect(result.tokens.primaryColor).toBe("#123456");
    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-hex token colour", async () => {
    await expect(
      service.update("admin-1", { tokens: { primaryColor: "red; background:url(x)" } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.siteCustomization.update).not.toHaveBeenCalled();
  });

  it("only issues upload URLs for supported image types", async () => {
    await expect(
      service.createAssetUploadUrl({ assetType: "logo", mimeType: "text/html" }),
    ).rejects.toBeInstanceOf(BadRequestException);

    storage.createPresignedUpload.mockResolvedValue({
      url: "https://s3/upload",
      objectKey: "site-assets/logo/2026/11/07/abc.png",
      expiresAt: now,
    });
    const result = await service.createAssetUploadUrl({ assetType: "logo", mimeType: "image/png" });
    expect(result).toEqual({
      uploadUrl: "https://s3/upload",
      assetUrl: "/api/v1/media/public/site-assets/logo/2026/11/07/abc.png",
    });
  });

  it("never serves objects outside the site-asset prefix", async () => {
    expect(await service.resolvePublicAsset("tracks/user-1/song.mp3")).toBeNull();
    expect(await service.resolvePublicAsset("site-assets/../tracks/song.mp3")).toBeNull();
    expect(storage.verifyObjectExists).not.toHaveBeenCalled();

    storage.verifyObjectExists.mockResolvedValue(true);
    storage.createPresignedDownload.mockResolvedValue("https://s3/download");
    expect(await service.resolvePublicAsset("site-assets/logo/a.png")).toBe("https://s3/download");
  });
});
