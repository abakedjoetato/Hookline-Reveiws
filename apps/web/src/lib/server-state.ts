import {
  LiveSessionStatus,
  StreamingPlatform,
  QueueStatus,
  ProcessingState,
  AccountStatus,
  Role,
  AdminPermission,
  HostApplicationStatus,
  StationStatus,
  PayoutProvider,
  PublicLiveSessionSummary,
  PublicLiveSessionDetail,
  PublicQueueEntry,
  UserSubmissionSummary,
  SubmissionEligibilityResponse,
  TrackSummary,
  CreateSubmissionDto,
  CreateSubmissionResponse,
  UpgradeSubmissionDto,
  UpgradeSubmissionResponse,
  CreateTrackUploadUrlDto,
  CreateUploadUrlResponse,
  ThemeTokens,
  PublicThemeConfig,
  AdminCustomizationConfig,
  UserProfile,
  UserSessionInfo,
  SecurityEventLog,
  UserPreferencesDto,
  PlatformSettingsDto,
  HostApplicationSummary,
  HostProfileSummary,
  StationSummary,
  PublicStationDetail,
} from "@platform/types";
import { RESERVED_SLUGS, slugifyHostname } from "@platform/validation";

export interface StoredUser extends UserProfile {
  passwordHash: string;
}

export interface StoredSessionToken {
  id: string;
  token: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface StoredSecurityLog extends SecurityEventLog {
  userId: string;
}

export interface StoredThemeCustomization extends AdminCustomizationConfig {}

export interface StoredHostApplication extends HostApplicationSummary {}

export interface StoredHostProfile extends HostProfileSummary {}

export interface StoredStation extends StationSummary {}

export interface StoredPayoutAccount {
  id: string;
  hostId: string;
  userId: string;
  provider: PayoutProvider;
  providerAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  isIdentityVerified: boolean;
  onboardingState: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSession extends PublicLiveSessionDetail {
  tiers: {
    tierSnapshotId: string;
    name: string;
    priceCents: number;
    priorityRank: number;
    colorSlot: string;
    available: boolean;
  }[];
}

export interface StoredTrack extends TrackSummary {
  audioDataUrl?: string;
  originalFilename?: string;
  mimeType?: string;
}

export interface StoredQueueEntry extends PublicQueueEntry {
  submissionId: string;
  submittingUserId: string;
  sourceTrackId: string;
}

export interface StoredSubmission extends UserSubmissionSummary {
  submittingUserId: string;
  sourceTrackId: string;
  artistIdentityId: string;
}

// Global server state singleton for Next.js App Router
declare global {
  // eslint-disable-next-line no-var
  var __THE_QUEUE_STATE__:
    | {
        users: Map<string, StoredUser>;
        sessionTokens: Map<string, StoredSessionToken>;
        securityLogs: StoredSecurityLog[];
        userPreferences: Map<string, UserPreferencesDto>;
        themeCustomization: StoredThemeCustomization;
        platformSettings: {
          requireManualHostApproval: boolean;
          updatedAt: string;
          updatedByUserId: string | null;
        };
        hostApplications: Map<string, StoredHostApplication>;
        hostProfiles: Map<string, StoredHostProfile>;
        stations: Map<string, StoredStation>;
        payoutAccounts: Map<string, StoredPayoutAccount>;
        sessions: Map<string, StoredSession>;
        queues: Map<string, StoredQueueEntry[]>;
        tracks: Map<string, StoredTrack>;
        submissions: Map<string, StoredSubmission>;
        uploadIntents: Map<
          string,
          {
            trackId: string;
            intentId: string;
            metadata: CreateTrackUploadUrlDto;
            expiresAt: Date;
          }
        >;
      }
    | undefined;
}

const DEFAULT_AUDIO_SAMPLE =
  "https://actions.google.com/sounds/v1/science_fiction/alien_beacon.ogg";

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  primaryColor: "#8B5CF6",
  primaryHoverColor: "#7C3AED",
  secondaryColor: "#27272A",
  accentColor: "#A78BFA",
  backgroundColor: "#09090B",
  surfaceColor: "#18181B",
  textColor: "#FAFAFA",
  mutedTextColor: "#A1A1AA",
  borderColor: "#27272A",
  liveColor: "#EF4444",
  successColor: "#22C55E",
  warningColor: "#F59E0B",
  dangerColor: "#EF4444",
};

function initDatabase() {
  if (global.__THE_QUEUE_STATE__) {
    return global.__THE_QUEUE_STATE__;
  }

  const users = new Map<string, StoredUser>();
  const sessionTokens = new Map<string, StoredSessionToken>();
  const securityLogs: StoredSecurityLog[] = [];
  const userPreferences = new Map<string, UserPreferencesDto>();

  // 1. Seed Default Demo User
  const demoUser: StoredUser = {
    id: "user-demo",
    email: "artist@thequeue.live",
    username: "demoartist",
    displayName: "Demo Artist",
    passwordHash: "DemoPassword123!",
    accountStatus: AccountStatus.ACTIVE,
    emailVerified: true,
    bio: "Independent electronic music producer and mixing engineer. Constantly exploring soundscapes.",
    avatarUrl: null,
    country: "United States",
    websiteUrl: "https://thequeue.live",
    roles: [Role.USER],
    permissions: [],
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.set(demoUser.id, demoUser);

  // 2. Seed Default Administrator User
  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || "admin@thequeue.live";
  const adminUsername = process.env.ADMIN_BOOTSTRAP_USERNAME || "admin";
  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || "AdminMasterKey2026!";

  const adminUser: StoredUser = {
    id: "user-admin",
    email: adminEmail,
    username: adminUsername,
    displayName: "System Administrator",
    passwordHash: adminPassword,
    accountStatus: AccountStatus.ACTIVE,
    emailVerified: true,
    bio: "TheQueue Platform Administrator & System Controller.",
    avatarUrl: null,
    country: "United States",
    websiteUrl: null,
    roles: [Role.OWNER_ADMIN, Role.MODERATOR],
    permissions: Object.values(AdminPermission),
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.set(adminUser.id, adminUser);

  // Seed preferences
  userPreferences.set(demoUser.id, {
    emailNotifications: true,
    marketingEmails: false,
    soundEffects: true,
    themeMode: "dark",
  });
  userPreferences.set(adminUser.id, {
    emailNotifications: true,
    marketingEmails: false,
    soundEffects: true,
    themeMode: "dark",
  });

  // 3. Seed Site Customization Theme
  const themeCustomization: StoredThemeCustomization = {
    id: "site-customization-default",
    siteName: "TheQueue",
    primaryLogoUrl: null,
    alternateLogoUrl: null,
    faviconUrl: null,
    tokens: { ...DEFAULT_THEME_TOKENS },
    customCss: null,
    updatedByUserId: adminUser.id,
    updatedAt: new Date().toISOString(),
  };

  const platformSettings = {
    requireManualHostApproval: true,
    updatedAt: new Date().toISOString(),
    updatedByUserId: adminUser.id,
  };

  const hostApplications = new Map<string, StoredHostApplication>();
  const hostProfiles = new Map<string, StoredHostProfile>();
  const stations = new Map<string, StoredStation>();
  const payoutAccounts = new Map<string, StoredPayoutAccount>();

  // Seed Host Users, Profiles & Stations
  const kvibeUser: StoredUser = {
    id: "user-kvibe",
    email: "djkvibe@thequeue.live",
    username: "djkvibe",
    displayName: "DJ K-Vibe",
    passwordHash: "HostPassword123!",
    accountStatus: AccountStatus.ACTIVE,
    emailVerified: true,
    bio: "Streamer & Producer listening to independent hip-hop, R&B, and electronic music. Giving honest feedback and playlist placements.",
    avatarUrl: null,
    country: "United States",
    websiteUrl: "https://twitch.tv/djkvibe",
    roles: [Role.USER, Role.HOST],
    permissions: [],
    createdAt: new Date(Date.now() - 86400000 * 90).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.set(kvibeUser.id, kvibeUser);

  const aurabeatsUser: StoredUser = {
    id: "user-aurabeats",
    email: "aurabeats@thequeue.live",
    username: "aurabeats",
    displayName: "AuraBeats",
    passwordHash: "HostPassword123!",
    accountStatus: AccountStatus.ACTIVE,
    emailVerified: true,
    bio: "Multi-platinum sound designer & mix engineer reviewing community submissions live on stream.",
    avatarUrl: null,
    country: "Canada",
    websiteUrl: "https://youtube.com/@aurabeats",
    roles: [Role.USER, Role.HOST],
    permissions: [],
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.set(aurabeatsUser.id, aurabeatsUser);

  const metrowaveUser: StoredUser = {
    id: "user-metrowave",
    email: "metrowave@thequeue.live",
    username: "metrowave",
    displayName: "MetroWave",
    passwordHash: "HostPassword123!",
    accountStatus: AccountStatus.ACTIVE,
    emailVerified: true,
    bio: "Synthwave, Cyberpunk, and Retro Electro live station. Reviewing tracks for Spotify editorial pitch.",
    avatarUrl: null,
    country: "United Kingdom",
    websiteUrl: "https://kick.com/metrowave",
    roles: [Role.USER, Role.HOST],
    permissions: [],
    createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.set(metrowaveUser.id, metrowaveUser);

  // Seed Host Profiles
  const kvibeProfile: StoredHostProfile = {
    id: "host-profile-kvibe",
    userId: kvibeUser.id,
    publicHostName: "DJ K-Vibe",
    normalizedHostName: "dj k-vibe",
    hostSlug: "dj-k-vibe",
    normalizedHostSlug: "dj-k-vibe",
    isApproved: true,
    biography: kvibeUser.bio,
    primaryStreamingPlatform: StreamingPlatform.TWITCH,
    primaryStreamingProfileUrl: "https://twitch.tv/djkvibe",
    country: "United States",
    createdAt: new Date(Date.now() - 86400000 * 90).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  hostProfiles.set(kvibeProfile.id, kvibeProfile);

  const auraProfile: StoredHostProfile = {
    id: "host-profile-aurabeats",
    userId: aurabeatsUser.id,
    publicHostName: "AuraBeats",
    normalizedHostName: "aurabeats",
    hostSlug: "aurabeats-studio",
    normalizedHostSlug: "aurabeats-studio",
    isApproved: true,
    biography: aurabeatsUser.bio,
    primaryStreamingPlatform: StreamingPlatform.YOUTUBE,
    primaryStreamingProfileUrl: "https://youtube.com/@aurabeats",
    country: "Canada",
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  hostProfiles.set(auraProfile.id, auraProfile);

  const metroProfile: StoredHostProfile = {
    id: "host-profile-metrowave",
    userId: metrowaveUser.id,
    publicHostName: "MetroWave",
    normalizedHostName: "metrowave",
    hostSlug: "metrowave-synth",
    normalizedHostSlug: "metrowave-synth",
    isApproved: true,
    biography: metrowaveUser.bio,
    primaryStreamingPlatform: StreamingPlatform.KICK,
    primaryStreamingProfileUrl: "https://kick.com/metrowave",
    country: "United Kingdom",
    createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  hostProfiles.set(metroProfile.id, metroProfile);

  // Seed Payout Accounts (Stripe Connected)
  payoutAccounts.set(kvibeUser.id, {
    id: "payout-kvibe",
    hostId: kvibeProfile.id,
    userId: kvibeUser.id,
    provider: PayoutProvider.STRIPE,
    providerAccountId: "acct_kvibe_live_123456",
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    isIdentityVerified: true,
    onboardingState: "COMPLETED",
    createdAt: new Date(Date.now() - 86400000 * 90).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  payoutAccounts.set(aurabeatsUser.id, {
    id: "payout-aura",
    hostId: auraProfile.id,
    userId: aurabeatsUser.id,
    provider: PayoutProvider.STRIPE,
    providerAccountId: "acct_aura_live_234567",
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    isIdentityVerified: true,
    onboardingState: "COMPLETED",
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  payoutAccounts.set(metrowaveUser.id, {
    id: "payout-metro",
    hostId: metroProfile.id,
    userId: metrowaveUser.id,
    provider: PayoutProvider.STRIPE,
    providerAccountId: "acct_metro_live_345678",
    chargesEnabled: true,
    payoutsEnabled: true,
    detailsSubmitted: true,
    isIdentityVerified: true,
    onboardingState: "COMPLETED",
    createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed Stations
  const station1: StoredStation = {
    id: "station-k-vibe",
    hostId: kvibeProfile.id,
    stationName: "DJ K-Vibe",
    normalizedStationName: "dj k-vibe",
    slug: "dj-k-vibe",
    description: "Streamer & Producer listening to independent hip-hop, R&B, and electronic music. Honest live feedback and playlist placements.",
    profileImageKey: null,
    bannerImageKey: null,
    status: StationStatus.ACTIVE,
    isPublicVisible: true,
    isApproved: true,
    primaryStreamingPlatform: StreamingPlatform.TWITCH,
    streamUrl: "https://twitch.tv",
    acceptedContentRules: "Hip-Hop, R&B, Electronic. MP3/WAV under 5 minutes.",
    explicitContentAllowed: true,
    maxTrackDurationSeconds: 300,
    maxQueueSize: 50,
    isLive: true,
    currentLiveSessionId: "session-k-vibe",
    hostName: "DJ K-Vibe",
    createdAt: new Date(Date.now() - 86400000 * 90).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  stations.set(station1.id, station1);

  const station2: StoredStation = {
    id: "station-aurabeats",
    hostId: auraProfile.id,
    stationName: "AuraBeats",
    normalizedStationName: "aurabeats",
    slug: "aurabeats-studio",
    description: "Multi-platinum sound designer & mix engineer reviewing community submissions live on stream.",
    profileImageKey: null,
    bannerImageKey: null,
    status: StationStatus.ACTIVE,
    isPublicVisible: true,
    isApproved: true,
    primaryStreamingPlatform: StreamingPlatform.YOUTUBE,
    streamUrl: "https://youtube.com",
    acceptedContentRules: "All genres welcome. High quality audio preferred.",
    explicitContentAllowed: true,
    maxTrackDurationSeconds: 360,
    maxQueueSize: 40,
    isLive: true,
    currentLiveSessionId: "session-aurabeats",
    hostName: "AuraBeats",
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  stations.set(station2.id, station2);

  const station3: StoredStation = {
    id: "station-metrowave",
    hostId: metroProfile.id,
    stationName: "MetroWave",
    normalizedStationName: "metrowave",
    slug: "metrowave-synth",
    description: "Synthwave, Cyberpunk, and Retro Electro live station. Reviewing tracks for Spotify editorial pitch.",
    profileImageKey: null,
    bannerImageKey: null,
    status: StationStatus.ACTIVE,
    isPublicVisible: true,
    isApproved: true,
    primaryStreamingPlatform: StreamingPlatform.KICK,
    streamUrl: "https://kick.com",
    acceptedContentRules: "Synthwave, Darksynth, Retrowave, Cyberpunk.",
    explicitContentAllowed: false,
    maxTrackDurationSeconds: 420,
    maxQueueSize: 30,
    isLive: true,
    currentLiveSessionId: "session-metrowave",
    hostName: "MetroWave",
    createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  stations.set(station3.id, station3);

  // Seed an approved offline station
  const station4: StoredStation = {
    id: "station-soundwave",
    hostId: "host-profile-soundwave",
    stationName: "SoundWave FM",
    normalizedStationName: "soundwave fm",
    slug: "soundwave-fm",
    description: "Indie Pop, Rock and Singer-Songwriter showcases every Tuesday and Thursday.",
    profileImageKey: null,
    bannerImageKey: null,
    status: StationStatus.ACTIVE,
    isPublicVisible: true,
    isApproved: true,
    primaryStreamingPlatform: StreamingPlatform.TWITCH,
    streamUrl: "https://twitch.tv",
    acceptedContentRules: "Original tracks only. No unmixed voice memos.",
    explicitContentAllowed: true,
    maxTrackDurationSeconds: 300,
    maxQueueSize: 25,
    isLive: false,
    currentLiveSessionId: null,
    hostName: "SoundWave FM",
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  stations.set(station4.id, station4);

  const sessions = new Map<string, StoredSession>();
  const queues = new Map<string, StoredQueueEntry[]>();
  const tracks = new Map<string, StoredTrack>();
  const submissions = new Map<string, StoredSubmission>();
  const uploadIntents = new Map();

  // 4. Seed Sessions
  const session1: StoredSession = {
    id: "session-k-vibe",
    stationId: "station-k-vibe",
    stationName: "DJ K-Vibe Radio",
    stationSlug: "dj-k-vibe",
    hostName: "DJ K-Vibe",
    hostBio: "Streamer & Producer listening to independent hip-hop, R&B, and electronic music. Giving honest feedback and playlist placements.",
    liveTitle: "Friday Night Live Heat — Artist Song Reviews & Feedback",
    status: LiveSessionStatus.LIVE,
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    primaryStreamingPlatform: StreamingPlatform.TWITCH,
    streamUrl: "https://twitch.tv",
    queueRevision: 4,
    submissionsOpen: true,
    freeLineOpen: true,
    paidSubmissionsOpen: true,
    currentQueueEntryId: "entry-1",
    currentTrack: {
      songName: "Solar Flare",
      artistName: "Astral Motion",
      durationSeconds: 198,
    },
    tiers: [
      {
        tierSnapshotId: "tier-kvibe-1",
        name: "Silver Fast-Track",
        priceCents: 500,
        priorityRank: 1,
        colorSlot: "TIER_COLOR_1",
        available: true,
      },
      {
        tierSnapshotId: "tier-kvibe-2",
        name: "Gold VIP Review",
        priceCents: 1500,
        priorityRank: 2,
        colorSlot: "TIER_COLOR_2",
        available: true,
      },
      {
        tierSnapshotId: "tier-kvibe-3",
        name: "Diamond Instant Play",
        priceCents: 3000,
        priorityRank: 3,
        colorSlot: "TIER_COLOR_3",
        available: true,
      },
    ],
  };

  const session2: StoredSession = {
    id: "session-aurabeats",
    stationId: "station-aurabeats",
    stationName: "AuraBeats Studio Live",
    stationSlug: "aurabeats-studio",
    hostName: "AuraBeats",
    hostBio: "Multi-platinum sound designer & mix engineer reviewing community submissions live on stream.",
    liveTitle: "Saturday Producer Showcase & Mix Critiques",
    status: LiveSessionStatus.LIVE,
    startedAt: new Date(Date.now() - 7200000).toISOString(),
    primaryStreamingPlatform: StreamingPlatform.YOUTUBE,
    streamUrl: "https://youtube.com",
    queueRevision: 2,
    submissionsOpen: true,
    freeLineOpen: true,
    paidSubmissionsOpen: true,
    currentQueueEntryId: null,
    currentTrack: {
      songName: "Velvet Groove",
      artistName: "Luna & The Waves",
      durationSeconds: 215,
    },
    tiers: [
      {
        tierSnapshotId: "tier-aura-1",
        name: "Priority Jump",
        priceCents: 1000,
        priorityRank: 1,
        colorSlot: "TIER_COLOR_1",
        available: true,
      },
      {
        tierSnapshotId: "tier-aura-2",
        name: "Full Mix Breakdown VIP",
        priceCents: 2500,
        priorityRank: 2,
        colorSlot: "TIER_COLOR_2",
        available: true,
      },
    ],
  };

  const session3: StoredSession = {
    id: "session-metrowave",
    stationId: "station-metrowave",
    stationName: "MetroWave Synthetics",
    stationSlug: "metrowave-synth",
    hostName: "MetroWave",
    hostBio: "Synthwave, Cyberpunk, and Retro Electro live station. Reviewing tracks for Spotify editorial pitch.",
    liveTitle: "Neon Nights Live Submissions & Sound Design Talk",
    status: LiveSessionStatus.LIVE,
    startedAt: new Date(Date.now() - 1800000).toISOString(),
    primaryStreamingPlatform: StreamingPlatform.KICK,
    streamUrl: "https://kick.com",
    queueRevision: 1,
    submissionsOpen: true,
    freeLineOpen: true,
    paidSubmissionsOpen: true,
    currentQueueEntryId: null,
    currentTrack: null,
    tiers: [
      {
        tierSnapshotId: "tier-metro-1",
        name: "Express Queue",
        priceCents: 750,
        priorityRank: 1,
        colorSlot: "TIER_COLOR_1",
        available: true,
      },
    ],
  };

  sessions.set(session1.id, session1);
  sessions.set(session2.id, session2);
  sessions.set(session3.id, session3);

  // 5. Seed Queues
  const queue1: StoredQueueEntry[] = [
    {
      id: "entry-1",
      liveSessionId: session1.id,
      status: QueueStatus.PLAYING,
      sortOrder: 1,
      priorityRank: 2,
      isPriority: true,
      tierName: "Gold VIP Review",
      colorSlot: "TIER_COLOR_2",
      songName: "Solar Flare",
      artistName: "Astral Motion",
      durationSeconds: 198,
      submittedAt: new Date(Date.now() - 3000000).toISOString(),
      submissionId: "sub-1",
      submittingUserId: "other-user-1",
      sourceTrackId: "track-1",
    },
    {
      id: "entry-2",
      liveSessionId: session1.id,
      status: QueueStatus.NEXT,
      sortOrder: 2,
      priorityRank: 1,
      isPriority: true,
      tierName: "Silver Fast-Track",
      colorSlot: "TIER_COLOR_1",
      songName: "Cyber Sunset",
      artistName: "Vapor Knight",
      durationSeconds: 210,
      submittedAt: new Date(Date.now() - 2500000).toISOString(),
      submissionId: "sub-2",
      submittingUserId: "other-user-2",
      sourceTrackId: "track-2",
    },
    {
      id: "entry-3",
      liveSessionId: session1.id,
      status: QueueStatus.QUEUED,
      sortOrder: 3,
      priorityRank: 0,
      isPriority: false,
      tierName: null,
      colorSlot: "FREE_LINE",
      songName: "Midnight Echoes",
      artistName: demoUser.displayName,
      durationSeconds: 185,
      submittedAt: new Date(Date.now() - 1200000).toISOString(),
      submissionId: "sub-3",
      submittingUserId: demoUser.id,
      sourceTrackId: "track-user-1",
    },
  ];

  queues.set(session1.id, queue1);
  queues.set(session2.id, []);
  queues.set(session3.id, []);

  // 6. Seed Tracks for Demo User
  const track1: StoredTrack = {
    id: "track-user-1",
    userId: demoUser.id,
    artistIdentityId: "artist-identity-1",
    songName: "Midnight Echoes",
    albumName: "Neon Dreamscapes",
    explicitContent: false,
    bpm: 124,
    musicalKey: "A Minor",
    durationSeconds: 185,
    processingState: ProcessingState.READY,
    artistIdentity: {
      id: "artist-identity-1",
      artistName: demoUser.displayName,
    },
    audioDataUrl: DEFAULT_AUDIO_SAMPLE,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  };

  const track2: StoredTrack = {
    id: "track-user-2",
    userId: demoUser.id,
    artistIdentityId: "artist-identity-1",
    songName: "Golden Horizon",
    albumName: "Neon Dreamscapes",
    explicitContent: false,
    bpm: 110,
    musicalKey: "F Major",
    durationSeconds: 215,
    processingState: ProcessingState.READY,
    artistIdentity: {
      id: "artist-identity-1",
      artistName: demoUser.displayName,
    },
    audioDataUrl: DEFAULT_AUDIO_SAMPLE,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  };

  const track3: StoredTrack = {
    id: "track-user-3",
    userId: demoUser.id,
    artistIdentityId: "artist-identity-1",
    songName: "Late Night Drive",
    albumName: null,
    explicitContent: false,
    bpm: 95,
    musicalKey: "C Major",
    durationSeconds: 240,
    processingState: ProcessingState.READY,
    artistIdentity: {
      id: "artist-identity-1",
      artistName: demoUser.displayName,
    },
    audioDataUrl: DEFAULT_AUDIO_SAMPLE,
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  };

  tracks.set(track1.id, track1);
  tracks.set(track2.id, track2);
  tracks.set(track3.id, track3);

  // 7. Seed Submissions for demo user
  const sub1: StoredSubmission = {
    id: "sub-3",
    submittingUserId: demoUser.id,
    liveSessionId: session1.id,
    sessionTitle: session1.liveTitle,
    sessionStatus: session1.status,
    stationName: session1.stationName,
    songName: track1.songName,
    artistName: demoUser.displayName,
    durationSeconds: track1.durationSeconds,
    isPriority: false,
    tierName: null,
    tierColorSlot: null,
    currentQueueStatus: QueueStatus.QUEUED,
    submittedAt: new Date(Date.now() - 1200000).toISOString(),
    sourceTrackId: track1.id,
    artistIdentityId: track1.artistIdentityId,
    queueEntry: {
      id: "entry-3",
      status: QueueStatus.QUEUED,
      priorityRank: 0,
      sortOrder: 3,
    },
  };

  submissions.set(sub1.id, sub1);

  // Create initial demo session cookie token
  const initialSessionToken: StoredSessionToken = {
    id: "sess-demo-initial",
    token: "demo-session-token-12345",
    userId: demoUser.id,
    ipAddress: "127.0.0.1",
    userAgent: "Desktop Browser",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
  };
  sessionTokens.set(initialSessionToken.token, initialSessionToken);

  securityLogs.push({
    id: "sec-log-1",
    userId: demoUser.id,
    eventType: "LOGIN_SUCCESS",
    ipAddress: "127.0.0.1",
    userAgent: "Desktop Browser",
    createdAt: new Date().toISOString(),
  });

  global.__THE_QUEUE_STATE__ = {
    users,
    sessionTokens,
    securityLogs,
    userPreferences,
    themeCustomization,
    platformSettings,
    hostApplications,
    hostProfiles,
    stations,
    payoutAccounts,
    sessions,
    queues,
    tracks,
    submissions,
    uploadIntents,
  };

  return global.__THE_QUEUE_STATE__;
}

export const serverDb = initDatabase();

// Station, Host & Slug helper functions
export function generateUniqueStationSlug(baseName: string, excludeStationId?: string): string {
  let candidate = slugifyHostname(baseName);
  if (!candidate || candidate.length < 3) {
    candidate = "station";
  }

  // Check if reserved
  if (RESERVED_SLUGS.includes(candidate as any)) {
    candidate = `${candidate}-station`;
  }

  // Check existing slugs in database
  let slug = candidate;
  let counter = 2;
  const isSlugTaken = (testSlug: string) => {
    for (const st of serverDb.stations.values()) {
      if (st.id !== excludeStationId && st.slug.toLowerCase() === testSlug.toLowerCase()) {
        return true;
      }
    }
    return false;
  };

  while (isSlugTaken(slug)) {
    slug = `${candidate}-${counter}`;
    counter++;
  }

  return slug;
}

export function getPublicStationsList(): StationSummary[] {
  const result: StationSummary[] = [];
  for (const st of serverDb.stations.values()) {
    if (st.isApproved && st.isPublicVisible && st.status === StationStatus.ACTIVE) {
      // Look up if currently live
      let live = false;
      let sessionId: string | null = null;
      for (const sess of serverDb.sessions.values()) {
        if (sess.stationId === st.id && sess.status === LiveSessionStatus.LIVE) {
          live = true;
          sessionId = sess.id;
          break;
        }
      }
      result.push({
        ...st,
        isLive: live,
        currentLiveSessionId: sessionId,
      });
    }
  }
  return result;
}

export function getPublicStationDetail(hostnameOrSlug: string): PublicStationDetail | null {
  const normalized = hostnameOrSlug.toLowerCase().trim();
  let station: StoredStation | null = null;
  for (const st of serverDb.stations.values()) {
    if (st.slug.toLowerCase() === normalized) {
      station = st;
      break;
    }
  }

  if (!station || !station.isApproved || station.status !== StationStatus.ACTIVE) {
    return null;
  }

  // Find active live session if any
  let currentSession: PublicLiveSessionDetail | null = null;
  let isLive = false;
  for (const sess of serverDb.sessions.values()) {
    if (sess.stationId === station.id && sess.status === LiveSessionStatus.LIVE) {
      currentSession = sess;
      isLive = true;
      break;
    }
  }

  // Find host bio
  const hostProfile = serverDb.hostProfiles.get(station.hostId);
  const hostUser = hostProfile ? serverDb.users.get(hostProfile.userId) : null;

  return {
    id: station.id,
    stationName: station.stationName,
    hostname: station.slug,
    slug: station.slug,
    description: station.description || null,
    profileImageKey: station.profileImageKey || null,
    bannerImageKey: station.bannerImageKey || null,
    primaryStreamingPlatform: station.primaryStreamingPlatform,
    streamUrl: station.streamUrl || null,
    acceptedContentRules: station.acceptedContentRules || null,
    explicitContentAllowed: station.explicitContentAllowed,
    maxTrackDurationSeconds: station.maxTrackDurationSeconds,
    maxQueueSize: station.maxQueueSize,
    hostName: station.hostName || hostProfile?.publicHostName || station.stationName,
    hostBio: hostProfile?.biography || hostUser?.bio || null,
    isLive,
    currentSession,
  };
}

export function approveHostApplicationInternal(
  applicationId: string,
  actorUserId: string,
): { success: boolean; station?: StoredStation; error?: string } {
  const app = serverDb.hostApplications.get(applicationId);
  if (!app) {
    return { success: false, error: "Host application not found" };
  }

  // Strict check: Stripe Connect must be complete
  const payout = serverDb.payoutAccounts.get(app.applicantUserId);
  const isStripeComplete =
    payout?.chargesEnabled && payout?.payoutsEnabled && payout?.detailsSubmitted;

  if (!isStripeComplete) {
    return {
      success: false,
      error: "Cannot approve host application: Stripe Connect onboarding is incomplete",
    };
  }

  // Assign Role.HOST to applicant user
  const applicant = serverDb.users.get(app.applicantUserId);
  if (applicant) {
    if (!applicant.roles.includes(Role.HOST)) {
      applicant.roles.push(Role.HOST);
      applicant.updatedAt = new Date().toISOString();
    }
  }

  // Create or update HostProfile
  let hostProfile: StoredHostProfile | undefined;
  for (const hp of serverDb.hostProfiles.values()) {
    if (hp.userId === app.applicantUserId) {
      hostProfile = hp;
      break;
    }
  }

  const generatedSlug = generateUniqueStationSlug(app.publicHostName);

  if (!hostProfile) {
    hostProfile = {
      id: `host-profile-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: app.applicantUserId,
      publicHostName: app.publicHostName,
      normalizedHostName: app.publicHostName.toLowerCase().trim(),
      hostSlug: generatedSlug,
      normalizedHostSlug: generatedSlug,
      isApproved: true,
      biography: app.biography || applicant?.bio || null,
      primaryStreamingPlatform: app.primaryStreamingPlatform,
      primaryStreamingProfileUrl: app.primaryStreamingProfileUrl,
      country: app.country,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    serverDb.hostProfiles.set(hostProfile.id, hostProfile);
  } else {
    hostProfile.isApproved = true;
    hostProfile.updatedAt = new Date().toISOString();
  }

  // Link payout account to host profile
  if (payout) {
    payout.hostId = hostProfile.id;
  }

  // Create or activate persistent Station
  let station: StoredStation | undefined;
  for (const st of serverDb.stations.values()) {
    if (st.hostId === hostProfile.id) {
      station = st;
      break;
    }
  }

  if (!station) {
    station = {
      id: `station-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      hostId: hostProfile.id,
      stationName: app.publicHostName,
      normalizedStationName: app.publicHostName.toLowerCase().trim(),
      slug: hostProfile.hostSlug,
      description: app.biography || applicant?.bio || "Live music review and broadcaster station.",
      profileImageKey: null,
      bannerImageKey: null,
      status: StationStatus.ACTIVE,
      isPublicVisible: true,
      isApproved: true,
      primaryStreamingPlatform: app.primaryStreamingPlatform,
      streamUrl: app.primaryStreamingProfileUrl,
      acceptedContentRules: app.acceptedGenres ? `Genres: ${app.acceptedGenres}` : "All original music welcome.",
      explicitContentAllowed: true,
      maxTrackDurationSeconds: 300,
      maxQueueSize: 50,
      isLive: false,
      currentLiveSessionId: null,
      hostName: app.publicHostName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    serverDb.stations.set(station.id, station);
  } else {
    station.isApproved = true;
    station.status = StationStatus.ACTIVE;
    station.isPublicVisible = true;
    station.updatedAt = new Date().toISOString();
  }

  // Update application record
  app.status = HostApplicationStatus.APPROVED;
  app.payoutOnboardingStatus = "COMPLETED";
  app.reviewedByUserId = actorUserId;
  app.reviewedAt = new Date().toISOString();
  app.stationSlug = station.slug;
  app.updatedAt = new Date().toISOString();

  return { success: true, station };
}

// When requireManualHostApproval is set to false, auto-approve any eligible applications with complete Stripe
export function syncAutomaticApprovalsIfApplicable(actorUserId = "system") {
  if (serverDb.platformSettings.requireManualHostApproval) {
    return;
  }

  for (const app of serverDb.hostApplications.values()) {
    if (
      app.status === HostApplicationStatus.SUBMITTED ||
      app.status === HostApplicationStatus.UNDER_REVIEW ||
      app.status === HostApplicationStatus.PAYMENT_VERIFICATION_REQUIRED
    ) {
      const payout = serverDb.payoutAccounts.get(app.applicantUserId);
      const isStripeComplete =
        payout?.chargesEnabled && payout?.payoutsEnabled && payout?.detailsSubmitted;

      if (isStripeComplete) {
        approveHostApplicationInternal(app.id, actorUserId);
      }
    }
  }
}

// Auth helper functions for Next.js API Routes
export function getAuthenticatedUser(cookieHeader?: string | null): StoredUser | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session_token=([^;]+)/);
  if (!match) return null;
  const token = match[1];
  const session = serverDb.sessionTokens.get(token);
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    serverDb.sessionTokens.delete(token);
    return null;
  }
  session.lastSeenAt = new Date().toISOString();
  return serverDb.users.get(session.userId) || null;
}

export function createSessionForUser(
  userId: string,
  ipAddress = "127.0.0.1",
  userAgent = "Browser",
): { token: string; cookie: string } {
  const token = `sess_${Math.random().toString(36).substring(2)}_${Date.now()}`;
  const expiresAt = new Date(Date.now() + 86400000 * 7); // 7 days

  const sessionRecord: StoredSessionToken = {
    id: `sess-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    token,
    userId,
    ipAddress,
    userAgent,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  serverDb.sessionTokens.set(token, sessionRecord);

  const isProd = process.env.NODE_ENV === "production";
  const cookie = `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${isProd ? "; Secure" : ""}`;
  return { token, cookie };
}

export function sanitizeUser(user: StoredUser): UserProfile {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safe } = user;
  return safe;
}
