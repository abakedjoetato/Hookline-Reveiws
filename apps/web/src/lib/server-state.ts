import {
  LiveSessionStatus,
  StreamingPlatform,
  QueueStatus,
  ProcessingState,
  AccountStatus,
  Role,
  AdminPermission,
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
} from "@platform/types";

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
    sessions,
    queues,
    tracks,
    submissions,
    uploadIntents,
  };

  return global.__THE_QUEUE_STATE__;
}

export const serverDb = initDatabase();

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
