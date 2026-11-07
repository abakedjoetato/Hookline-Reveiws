import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@platform/database";
import {
  AccountStatus,
  LiveSessionStatus,
  ProcessingState,
  QueueStatus,
  StationStatus,
  StreamingPlatform,
} from "@platform/types";
import type {
  PublicQueueEntry,
  PublicStationDetail,
  PublicUserProfile,
  StationSummary,
  TrackSummary,
  WeeklyTop3Response,
} from "@platform/types";
import { HostService } from "../host/host.service";
import { LiveSessionsService } from "../live-sessions/live-sessions.service";
import { SiteCustomizationService } from "./site-customization.service";

/** Slugs and usernames are lowercase letters, digits, dashes and underscores. */
const HANDLE_PATTERN = /^[a-z0-9_-]{1,64}$/;

const ON_AIR_STATES = [LiveSessionStatus.LIVE, LiveSessionStatus.PAUSED];

/** Accounts whose public profile can be viewed. */
const VISIBLE_ACCOUNT_STATES = [
  AccountStatus.ACTIVE,
  AccountStatus.PENDING_EMAIL_VERIFICATION,
];

/** A host whose station may appear publicly: approved, not suspended/revoked, page enabled. */
const PUBLIC_HOST_WHERE = {
  isApproved: true,
  suspendedAt: null,
  revokedAt: null,
  isPublicVisible: true,
  publicPageEnabled: true,
};

/** A station that may appear publicly. Archived stations are hidden. */
const PUBLIC_STATION_WHERE = {
  deletedAt: null,
  isPublicVisible: true,
  status: { not: StationStatus.ARCHIVED },
  host: PUBLIC_HOST_WHERE,
};

export interface OverlayResponse {
  stationName: string;
  hostname: string;
  isLive: boolean;
  nowPlaying: PublicQueueEntry | null;
  theme: { style: string; accentColor: string };
}

/**
 * Unauthenticated read endpoints: the station directory, station pages
 * (/[hostname]), stream overlays and public user profiles.
 */
@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly host: HostService,
    private readonly liveSessions: LiveSessionsService,
    private readonly customization: SiteCustomizationService,
  ) {}

  private normalizeHandle(raw: string, what: string): string {
    const handle = (raw ?? "").trim().toLowerCase();
    if (!HANDLE_PATTERN.test(handle)) throw new NotFoundException(`${what} not found`);
    return handle;
  }

  private async onAirSession(stationId: string) {
    return this.prisma.liveSession.findFirst({
      where: { stationId, status: { in: ON_AIR_STATES } },
      orderBy: { startedAt: "desc" },
      select: { id: true, currentQueueEntryId: true },
    });
  }

  /**
   * Finds a public station by its slug. Falls back to the host's page slug,
   * then to a still-active redirect from a host's previous slug.
   */
  private async resolveStation(hostname: string) {
    const slug = this.normalizeHandle(hostname, "Station");
    const include = { host: true } as const;

    const bySlug = await this.prisma.station.findFirst({
      where: { slug, ...PUBLIC_STATION_WHERE },
      include,
    });
    if (bySlug) return bySlug;

    const firstStationOf = (hostId: string) =>
      this.prisma.station.findFirst({
        where: { hostId, ...PUBLIC_STATION_WHERE },
        orderBy: { createdAt: "asc" },
        include,
      });

    const host = await this.prisma.hostProfile.findUnique({
      where: { normalizedHostSlug: slug },
      select: { id: true },
    });
    if (host) {
      const station = await firstStationOf(host.id);
      if (station) return station;
    }

    const redirect = await this.prisma.hostSlugHistory.findFirst({
      where: {
        previousNormalizedSlug: slug,
        redirectEnabled: true,
        OR: [{ redirectExpiresAt: null }, { redirectExpiresAt: { gt: new Date() } }],
      },
      orderBy: { changedAt: "desc" },
      select: { hostId: true },
    });
    if (redirect) {
      const station = await firstStationOf(redirect.hostId);
      if (station) return station;
    }

    throw new NotFoundException("Station not found");
  }

  // ==========================================================================
  // Stations
  // ==========================================================================

  async listStations(): Promise<StationSummary[]> {
    const stations = await this.prisma.station.findMany({
      where: PUBLIC_STATION_WHERE,
      include: { host: true },
      orderBy: { createdAt: "asc" },
    });
    if (stations.length === 0) return [];

    const live = await this.prisma.liveSession.findMany({
      where: { stationId: { in: stations.map((s) => s.id) }, status: { in: ON_AIR_STATES } },
      orderBy: { startedAt: "desc" },
      select: { id: true, stationId: true },
    });
    const liveByStation = new Map<string, { id: string }>();
    for (const session of live) {
      if (!liveByStation.has(session.stationId)) liveByStation.set(session.stationId, session);
    }

    return stations
      .map((s) => this.host.toStationSummary(s, s.host, liveByStation.get(s.id) ?? null))
      .sort((a, b) => Number(Boolean(b.isLive)) - Number(Boolean(a.isLive)));
  }

  async getStation(hostname: string): Promise<PublicStationDetail> {
    const station = await this.resolveStation(hostname);
    const live = await this.onAirSession(station.id);
    const currentSession = live ? await this.liveSessions.getPublicLiveSession(live.id) : null;

    return {
      id: station.id,
      stationName: station.stationName,
      hostname: station.slug,
      slug: station.slug,
      description: station.description,
      profileImageKey: station.profileImageKey,
      bannerImageKey: station.bannerImageKey,
      primaryStreamingPlatform: station.primaryStreamingPlatform as StreamingPlatform,
      streamUrl: station.streamUrl,
      acceptedContentRules: station.acceptedContentRules,
      explicitContentAllowed: station.explicitContentAllowed,
      maxTrackDurationSeconds: station.maxTrackDurationSeconds,
      maxQueueSize: station.maxQueueSize,
      hostName: station.host.publicHostName,
      hostBio: station.host.biography,
      isLive: Boolean(currentSession),
      currentSession,
    };
  }

  async getWeeklyTop3(hostname: string, date?: string): Promise<WeeklyTop3Response> {
    const station = await this.resolveStation(hostname);
    let reference: Date | undefined;
    if (date) {
      reference = new Date(date);
      if (Number.isNaN(reference.getTime())) {
        throw new BadRequestException("date must be an ISO date such as 2026-11-07");
      }
    }
    return this.liveSessions.getWeeklyTop3(station.id, reference);
  }

  // ==========================================================================
  // Stream overlay (polled every few seconds by OBS browser sources)
  // ==========================================================================

  async getOverlay(hostname: string): Promise<OverlayResponse> {
    const station = await this.resolveStation(hostname);
    const [live, theme] = await Promise.all([
      this.onAirSession(station.id),
      this.customization.getPublic(),
    ]);

    let nowPlaying: PublicQueueEntry | null = null;
    if (live?.currentQueueEntryId && station.showCurrentTrackPublicly) {
      nowPlaying = await this.currentEntry(live.currentQueueEntryId, station);
    }

    return {
      stationName: station.stationName,
      hostname: station.slug,
      isLive: Boolean(live),
      nowPlaying,
      theme: { style: "modern", accentColor: theme.tokens.accentColor },
    };
  }

  /** The playing entry, masked by the station's public visibility settings. */
  private async currentEntry(
    entryId: string,
    station: {
      showSongNamePublicly: boolean;
      showArtistNamePublicly: boolean;
      showTierPublicly: boolean;
    },
  ): Promise<PublicQueueEntry | null> {
    const entry = await this.prisma.queueEntry.findUnique({
      where: { id: entryId },
      include: {
        submission: {
          include: {
            sourceTrack: { include: { artistIdentity: true } },
            trackSnapshot: true,
            priorityTierSnapshot: true,
            artistIdentity: true,
          },
        },
      },
    });
    if (!entry || entry.status !== QueueStatus.PLAYING) return null;

    const sub = entry.submission;
    const snap = sub.trackSnapshot;
    const track = sub.sourceTrack;
    const tier = sub.priorityTierSnapshot;
    return {
      id: entry.id,
      liveSessionId: entry.liveSessionId,
      status: entry.status as QueueStatus,
      sortOrder: Number(entry.sortOrder),
      priorityRank: entry.priorityRank,
      isPriority: sub.isPriority,
      tierName: station.showTierPublicly
        ? tier?.name || (sub.isPriority ? "Priority" : "Free Line")
        : null,
      colorSlot: tier?.colorSlot || "FREE_LINE",
      songName: station.showSongNamePublicly
        ? snap?.songName || track?.songName || "Untitled Track"
        : "Hidden",
      artistName: station.showArtistNamePublicly
        ? snap?.artistName || track?.artistIdentity?.artistName || "Unknown Artist"
        : "Hidden",
      durationSeconds: snap?.durationSeconds ?? track?.durationSeconds ?? 0,
      submittedAt: sub.submittedAt,
      spotifyUrl: station.showArtistNamePublicly ? sub.artistIdentity?.spotifyUrl ?? null : null,
      artistIdentityId: sub.artistIdentityId,
    };
  }

  // ==========================================================================
  // Public user profiles
  // ==========================================================================

  async getProfile(username: string): Promise<PublicUserProfile> {
    const normalizedUsername = this.normalizeHandle(username, "User");
    const user = await this.prisma.user.findFirst({
      where: {
        normalizedUsername,
        deletedAt: null,
        accountStatus: { in: VISIBLE_ACCOUNT_STATES },
      },
      include: {
        profile: true,
        artistIdentities: {
          where: { isPublic: true, deletedAt: null },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        },
        tracks: {
          where: {
            isPublic: true,
            isArchived: false,
            deletedAt: null,
            processingState: ProcessingState.READY,
          },
          orderBy: { createdAt: "desc" },
          include: {
            artistIdentity: true,
            genres: { include: { genre: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException("User not found");

    const publicTracks: TrackSummary[] = user.tracks.map((t) => {
      const identity =
        t.artistIdentity && t.artistIdentity.isPublic && !t.artistIdentity.deletedAt
          ? t.artistIdentity
          : null;
      return {
        id: t.id,
        userId: t.userId,
        artistIdentityId: identity?.id ?? null,
        songName: t.songName,
        albumName: t.albumName,
        explicitContent: t.explicitContent,
        bpm: t.bpm,
        musicalKey: t.musicalKey,
        durationSeconds: t.durationSeconds,
        processingState: t.processingState as ProcessingState,
        isPublic: t.isPublic,
        artistIdentity: identity
          ? { id: identity.id, artistName: identity.artistName, spotifyUrl: identity.spotifyUrl }
          : null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    });

    const genres = Array.from(
      new Set(user.tracks.flatMap((t) => t.genres.map((g) => g.genre.name))),
    ).sort((a, b) => a.localeCompare(b));

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.profile?.biography ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      bannerUrl: null,
      country: user.profile?.country ?? null,
      websiteUrl: user.profile?.websiteUrl ?? null,
      spotifyProfileUrl: user.profile?.spotifyProfileUrl ?? null,
      genres,
      artistIdentities: user.artistIdentities.map((a) => ({
        id: a.id,
        artistName: a.artistName,
        spotifyUrl: a.spotifyUrl,
        biography: a.biography,
      })),
      publicTracks,
      stats: {
        publicTracksCount: publicTracks.length,
        artistIdentitiesCount: user.artistIdentities.length,
        joinedDate: user.createdAt.toISOString(),
      },
    };
  }
}
