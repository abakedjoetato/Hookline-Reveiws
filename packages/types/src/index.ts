export enum PermissionOverrideType {
  GRANT = "GRANT",
  DENY = "DENY",
}

export enum Role {
  USER = "USER",
  HOST = "HOST",
  MODERATOR = "MODERATOR",
  OWNER_ADMIN = "OWNER_ADMIN",
}

export enum AccountStatus {
  ACTIVE = "ACTIVE",
  PENDING_EMAIL_VERIFICATION = "PENDING_EMAIL_VERIFICATION",
  SUSPENDED = "SUSPENDED",
  BANNED = "BANNED",
  DEACTIVATED = "DEACTIVATED",
  DELETION_PENDING = "DELETION_PENDING",
}

export enum HostApplicationStatus {
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  UNDER_REVIEW = "UNDER_REVIEW",
  MORE_INFORMATION_REQUIRED = "MORE_INFORMATION_REQUIRED",
  PAYMENT_VERIFICATION_REQUIRED = "PAYMENT_VERIFICATION_REQUIRED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  SUSPENDED = "SUSPENDED",
  REVOKED = "REVOKED",
  WITHDRAWN = "WITHDRAWN",
}

export enum StreamingPlatform {
  KICK = "KICK",
  YOUTUBE = "YOUTUBE",
  TIKTOK = "TIKTOK",
  FACEBOOK = "FACEBOOK",
  TWITCH = "TWITCH",
}

export enum PayoutProvider {
  STRIPE = "STRIPE",
}

export enum LiveSessionStatus {
  SCHEDULED = "SCHEDULED",
  PREPARING = "PREPARING",
  LIVE = "LIVE",
  PAUSED = "PAUSED",
  ENDING = "ENDING",
  ENDED = "ENDED",
  CANCELLED = "CANCELLED",
}

export enum ReservationStatus {
  ACTIVE = "ACTIVE",
  CONSUMED = "CONSUMED",
  EXPIRED = "EXPIRED",
  RELEASED = "RELEASED",
  CANCELLED = "CANCELLED",
}

export enum QueueStatus {
  AWAITING_PAYMENT = "AWAITING_PAYMENT",
  QUEUED = "QUEUED",
  NEXT = "NEXT",
  PLAYING = "PLAYING",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
  SKIPPED = "SKIPPED",
  REJECTED = "REJECTED",
  REMOVED = "REMOVED",
  CARRIED_OVER = "CARRIED_OVER",
  REFUND_PENDING = "REFUND_PENDING",
  REFUNDED = "REFUNDED",
  EXPIRED = "EXPIRED",
  MOVED_TO_HISTORY = "MOVED_TO_HISTORY",
}

export enum QueueBatchOperationType {
  MOVE_TO_HISTORY = "MOVE_TO_HISTORY",
  REINSERT_TO_QUEUE = "REINSERT_TO_QUEUE",
  REMOVE_FROM_ACTIVE_QUEUE = "REMOVE_FROM_ACTIVE_QUEUE",
}

export enum TierColorSlot {
  FREE_LINE = "FREE_LINE",
  TIER_COLOR_1 = "TIER_COLOR_1",
  TIER_COLOR_2 = "TIER_COLOR_2",
  TIER_COLOR_3 = "TIER_COLOR_3",
  TIER_COLOR_4 = "TIER_COLOR_4",
  TIER_COLOR_5 = "TIER_COLOR_5",
  TIER_COLOR_6 = "TIER_COLOR_6",
  TIER_COLOR_7 = "TIER_COLOR_7",
  TIER_COLOR_8 = "TIER_COLOR_8",
  TIER_COLOR_9 = "TIER_COLOR_9",
  TIER_COLOR_10 = "TIER_COLOR_10",
}

export enum PaymentStatus {
  CREATED = "CREATED",
  REQUIRES_ACTION = "REQUIRES_ACTION",
  AUTHORIZED = "AUTHORIZED",
  CAPTURED = "CAPTURED",
  SETTLED = "SETTLED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
  REFUNDED = "REFUNDED",
  DISPUTED = "DISPUTED",
  CHARGEBACK = "CHARGEBACK",
}

export enum HostEarningStatus {
  PAYMENT_PENDING = "PAYMENT_PENDING",
  ALLOCATED_TO_STRIPE = "ALLOCATED_TO_STRIPE",
  REVERSED = "REVERSED",
  REFUNDED = "REFUNDED",
  DISPUTED = "DISPUTED",
}

export enum PayoutStatus {
  PENDING = "PENDING",
  IN_TRANSIT = "IN_TRANSIT",
  PAID = "PAID",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export enum ReportStatus {
  OPEN = "OPEN",
  UNDER_REVIEW = "UNDER_REVIEW",
  ACTIONED = "ACTIONED",
  DISMISSED = "DISMISSED",
  APPEALED = "APPEALED",
  CLOSED = "CLOSED",
}

export enum BanScope {
  ACCOUNT = "ACCOUNT",
  HOST_PRIVILEGES = "HOST_PRIVILEGES",
  SUBMISSIONS = "SUBMISSIONS",
  PAYMENTS = "PAYMENTS",
  PAYOUTS = "PAYOUTS",
  CONTENT_UPLOAD = "CONTENT_UPLOAD",
  IP = "IP",
  NETWORK = "NETWORK",
  DEVICE_RISK = "DEVICE_RISK",
  FULL_PLATFORM = "FULL_PLATFORM",
}

export enum TrackSourceType {
  UPLOADED_AUDIO = "UPLOADED_AUDIO",
  YOUTUBE = "YOUTUBE",
  SOUNDCLOUD = "SOUNDCLOUD",
  SPOTIFY = "SPOTIFY",
  BANDCAMP = "BANDCAMP",
  DIRECT_AUDIO_URL = "DIRECT_AUDIO_URL",
  OTHER_EXTERNAL = "OTHER_EXTERNAL",
}

export enum PlaybackCapability {
  NATIVE_AUDIO = "NATIVE_AUDIO",
  EMBEDDED_PLAYER = "EMBEDDED_PLAYER",
  EXTERNAL_ONLY = "EXTERNAL_ONLY",
  UNSUPPORTED = "UNSUPPORTED",
}

export enum ProcessingState {
  UPLOADING = "UPLOADING",
  PROCESSING = "PROCESSING",
  READY = "READY",
  FAILED = "FAILED",
}

export enum UploadIntentStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

export enum UploadIntentType {
  TRACK_AUDIO = "TRACK_AUDIO",
  TRACK_ARTWORK = "TRACK_ARTWORK",
}

export enum InvitationStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  REVOKED = "REVOKED",
  EXPIRED = "EXPIRED",
}

export enum StripePlatformMode {
  TEST = "TEST",
  LIVE = "LIVE",
}

export enum PaymentEmergencyState {
  PAYMENTS_ENABLED = "PAYMENTS_ENABLED",
  PAYMENTS_PAUSED = "PAYMENTS_PAUSED",
  PAYMENTS_DISABLED = "PAYMENTS_DISABLED",
}

export enum StationStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  ARCHIVED = "ARCHIVED",
}

export enum AdminPermission {
  ADMIN_PLATFORM_FULL = "ADMIN_PLATFORM_FULL",
  ADMIN_MODERATOR_MANAGE = "ADMIN_MODERATOR_MANAGE",
  ADMIN_ROLE_MANAGE = "ADMIN_ROLE_MANAGE",
  STRIPE_PLATFORM_CONFIGURE = "STRIPE_PLATFORM_CONFIGURE",
  STRIPE_PLATFORM_VIEW_STATUS = "STRIPE_PLATFORM_VIEW_STATUS",
  PAYMENT_CONFIGURATION_MANAGE = "PAYMENT_CONFIGURATION_MANAGE",
  PLATFORM_COMMISSION_MANAGE = "PLATFORM_COMMISSION_MANAGE",
  HOST_APPLICATION_MANAGE = "HOST_APPLICATION_MANAGE",
  USER_BAN_MANAGE = "USER_BAN_MANAGE",
  CONTENT_MODERATE = "CONTENT_MODERATE",
  PAYMENT_RECORD_VIEW = "PAYMENT_RECORD_VIEW",
  REFUND_MANAGE = "REFUND_MANAGE",
  DISPUTE_REVIEW = "DISPUTE_REVIEW",
  AUDIT_LOG_VIEW = "AUDIT_LOG_VIEW",
  PLATFORM_SETTINGS_MANAGE = "PLATFORM_SETTINGS_MANAGE",
}

// ============================================================================
// Worker Job Contracts
// ============================================================================

export enum MediaJobName {
  EXTRACT_AUDIO_METADATA = "EXTRACT_AUDIO_METADATA",
  PROCESS_ARTWORK = "PROCESS_ARTWORK",
  DELETE_USER_MEDIA = "DELETE_USER_MEDIA",
  DELETE_MEDIA_OBJECTS = "DELETE_MEDIA_OBJECTS",
  GENERATE_WAVEFORM = "GENERATE_WAVEFORM",
  TRANSCODE_AUDIO = "TRANSCODE_AUDIO",
  ANALYZE_LOUDNESS = "ANALYZE_LOUDNESS",
  DETECT_SILENCE = "DETECT_SILENCE",
  MALWARE_SCAN = "MALWARE_SCAN",
}

export interface ExtractAudioMetadataPayload {
  trackId: string;
  mediaVersionId: string;
  ownerUserId: string;
  objectKey: string;
  correlationId?: string;
}

export interface ProcessArtworkPayload {
  trackId: string;
  artworkId: string;
  ownerUserId: string;
  objectKey: string;
  correlationId?: string;
}

export interface DeleteUserMediaPayload {
  ownerUserId: string;
  correlationId?: string;
}

export interface DeleteMediaObjectsPayload {
  objectKeys: string[];
  correlationId?: string;
}

export enum StorageStatus {
  AVAILABLE = "AVAILABLE",
  DELETION_PENDING = "DELETION_PENDING",
  DELETED = "DELETED",
  MISSING = "MISSING",
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicLiveSessionSummary {
  id: string;
  stationId: string;
  stationName: string;
  stationSlug: string;
  hostName: string;
  liveTitle: string;
  status: LiveSessionStatus;
  startedAt: Date | string | null;
  primaryStreamingPlatform: StreamingPlatform;
  streamUrl: string | null;
  submissionsOpen: boolean;
  freeLineOpen: boolean;
  paidSubmissionsOpen: boolean;
}

export interface PublicLiveSessionDetail {
  id: string;
  stationId: string;
  stationName: string;
  stationSlug: string;
  hostName: string;
  hostBio: string | null;
  liveTitle: string;
  status: LiveSessionStatus;
  startedAt: Date | string | null;
  primaryStreamingPlatform: StreamingPlatform;
  streamUrl: string | null;
  queueRevision: number;
  submissionsOpen: boolean;
  freeLineOpen: boolean;
  paidSubmissionsOpen: boolean;
  currentQueueEntryId: string | null;
  currentTrack: {
    songName: string;
    artistName: string;
    durationSeconds: number;
    submitterName?: string;
    audioUrl?: string;
    artworkUrl?: string | null;
  } | null;
}

export interface PublicQueueEntry {
  id: string;
  liveSessionId: string;
  status: QueueStatus;
  sortOrder: number;
  priorityRank: number;
  isPriority: boolean;
  tierName: string | null;
  colorSlot: string;
  songName: string;
  artistName: string;
  durationSeconds: number;
  submittedAt: Date | string;
}

export interface UserSubmissionSummary {
  id: string;
  liveSessionId: string;
  sessionTitle: string;
  sessionStatus: LiveSessionStatus;
  stationName: string;
  songName: string;
  artistName: string;
  durationSeconds: number;
  isPriority: boolean;
  tierName: string | null;
  tierColorSlot: string | null;
  currentQueueStatus: QueueStatus;
  submittedAt: Date | string;
  queueEntry: {
    id: string;
    status: QueueStatus;
    priorityRank: number;
    sortOrder: number;
  } | null;
}

export enum SubmissionEligibilityReason {
  AVAILABLE = "AVAILABLE",
  SUBMISSIONS_DISABLED = "SUBMISSIONS_DISABLED",
  FREE_LINE_DISABLED = "FREE_LINE_DISABLED",
  TIER_DISABLED = "TIER_DISABLED",
  ACTIVE_FREE_LIMIT_REACHED = "ACTIVE_FREE_LIMIT_REACHED",
  TOTAL_FREE_LIMIT_REACHED = "TOTAL_FREE_LIMIT_REACHED",
  TOTAL_FREE_CAPACITY_REACHED = "TOTAL_FREE_CAPACITY_REACHED",
  USER_TIER_LIMIT_REACHED = "USER_TIER_LIMIT_REACHED",
  TOTAL_TIER_CAPACITY_REACHED = "TOTAL_TIER_CAPACITY_REACHED",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  INVALID_TIER = "INVALID_TIER",
}

export interface TierEligibilityInfo {
  tierSnapshotId?: string;
  isFree: boolean;
  available: boolean;
  reason: SubmissionEligibilityReason;
  name: string;
  priceCents: number;
  priorityRank: number;
  colorSlot?: string;
}

export interface SubmissionEligibilityResponse {
  liveSessionId: string;
  free: TierEligibilityInfo;
  priorityTiers: TierEligibilityInfo[];
}

export interface TrackSummary {
  id: string;
  userId: string;
  artistIdentityId: string;
  songName: string;
  albumName?: string | null;
  explicitContent: boolean;
  bpm?: number | null;
  musicalKey?: string | null;
  durationSeconds: number;
  processingState: ProcessingState;
  artistIdentity?: {
    id: string;
    artistName: string;
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateTrackUploadUrlDto {
  artistName: string;
  songName: string;
  albumName?: string;
  explicitContent?: boolean;
  bpm?: number;
  musicalKey?: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
}

export interface CreateUploadUrlResponse {
  trackId: string;
  uploadIntentId: string;
  uploadUrl: string;
  expiresAt: Date | string;
}

export interface CreateSubmissionDto {
  sourceTrackId: string;
  artistIdentityId: string;
  tierSnapshotId?: string;
}

export interface CreateSubmissionResponse {
  submission: {
    id: string;
    submittingUserId: string;
    sourceTrackId: string;
    artistIdentityId: string;
    liveSessionId: string;
    isPriority: boolean;
    priorityTierSnapshotId?: string | null;
    currentQueueStatus: QueueStatus;
    submittedAt: Date | string;
  };
  queueEntry: {
    id: string;
    liveSessionId: string;
    submissionId: string;
    status: QueueStatus;
    priorityRank: number;
    sortOrder: number;
  };
  clientSecret?: string;
}

export interface UpgradeSubmissionDto {
  tierSnapshotId: string;
}

export interface UpgradeSubmissionResponse {
  submission: {
    id: string;
    submittingUserId: string;
    sourceTrackId: string;
    artistIdentityId: string;
    liveSessionId: string;
    isPriority: boolean;
    priorityTierSnapshotId?: string | null;
    currentQueueStatus: QueueStatus;
    submittedAt: Date | string;
  };
  queueEntry: {
    id: string;
    liveSessionId: string;
    submissionId: string;
    status: QueueStatus;
    priorityRank: number;
    sortOrder: number;
  };
  clientSecret: string;
}

// ============================================================================
// Theme & Global Site Customization Types
// ============================================================================

export interface ThemeTokens {
  primaryColor: string;
  primaryHoverColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  liveColor: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
}

export interface PublicThemeConfig {
  siteName: string;
  primaryLogoUrl: string | null;
  alternateLogoUrl: string | null;
  faviconUrl: string | null;
  tokens: ThemeTokens;
  updatedAt: string;
}

export interface AdminCustomizationConfig extends PublicThemeConfig {
  id: string;
  customCss: string | null;
  updatedByUserId: string | null;
}

export interface UpdateCustomizationDto {
  siteName?: string;
  primaryLogoUrl?: string | null;
  alternateLogoUrl?: string | null;
  faviconUrl?: string | null;
  tokens?: Partial<ThemeTokens>;
  primaryColor?: string;
  primaryHoverColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  borderColor?: string;
  liveColor?: string;
  successColor?: string;
  warningColor?: string;
  dangerColor?: string;
  customCss?: string | null;
}

// ============================================================================
// User Account, Profile & Session Types
// ============================================================================

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  country?: string | null;
  websiteUrl?: string | null;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  roles: Role[];
  permissions: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RegisterDto {
  email: string;
  username: string;
  displayName: string;
  password: string;
  passwordConfirmation?: string;
  confirmPassword?: string;
}

export interface RegisterResponseDto {
  success: boolean;
  message: string;
  user?: UserProfile;
}

export interface UpdateUserProfileDto {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  country?: string;
  websiteUrl?: string;
}

export interface ChangePasswordDto {
  currentPassword?: string;
  newPassword: string;
}

export interface UserSessionInfo {
  id: string;
  createdAt: Date | string;
  lastSeenAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
  isCurrent: boolean;
}

export interface SecurityEventLog {
  id: string;
  eventType: string;
  createdAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UserPreferencesDto {
  emailNotifications: boolean;
  marketingEmails: boolean;
  soundEffects: boolean;
  themeMode: "dark" | "system";
}

// ============================================================================
// Host, Station, Stripe Connect & Platform Settings Types
// ============================================================================

export interface PlatformSettingsDto {
  requireManualHostApproval: boolean;
  allowPublicRegistrations?: boolean;
  maxActiveStations?: number;
  maintenanceMode?: boolean;
  updatedAt?: Date | string;
  updatedByUserId?: string | null;
}

export type PlatformSettings = PlatformSettingsDto;

export interface UpdatePlatformSettingsDto {
  requireManualHostApproval: boolean;
}

export interface HostProfileSummary {
  id: string;
  userId: string;
  publicHostName: string;
  normalizedHostName: string;
  hostSlug: string;
  normalizedHostSlug: string;
  isApproved: boolean;
  biography?: string | null;
  profileImageKey?: string | null;
  bannerImageKey?: string | null;
  primaryStreamingPlatform: StreamingPlatform;
  primaryStreamingProfileUrl?: string | null;
  country?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface StationSummary {
  id: string;
  hostId: string;
  stationName: string;
  normalizedStationName: string;
  slug: string;
  description?: string | null;
  profileImageKey?: string | null;
  bannerImageKey?: string | null;
  status: StationStatus;
  isPublicVisible: boolean;
  isApproved: boolean;
  primaryStreamingPlatform: StreamingPlatform;
  streamUrl?: string | null;
  acceptedContentRules?: string | null;
  explicitContentAllowed: boolean;
  maxTrackDurationSeconds: number;
  maxQueueSize: number;
  isLive?: boolean;
  currentLiveSessionId?: string | null;
  hostName?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type HostStationDetail = StationSummary & {
  isLive?: boolean;
  currentSessionId?: string | null;
  currentSession?: PublicLiveSessionDetail | null;
};

export interface PublicStationDetail {
  id: string;
  stationName: string;
  hostname: string;
  slug: string;
  description?: string | null;
  profileImageKey?: string | null;
  bannerImageKey?: string | null;
  primaryStreamingPlatform: StreamingPlatform;
  streamUrl?: string | null;
  acceptedContentRules?: string | null;
  explicitContentAllowed: boolean;
  maxTrackDurationSeconds: number;
  maxQueueSize: number;
  hostName: string;
  hostBio?: string | null;
  isLive: boolean;
  currentSession: PublicLiveSessionDetail | null;
}

export interface HostApplicationSummary {
  id: string;
  applicantUserId: string;
  applicantUser?: {
    id: string;
    email: string;
    username: string;
    displayName: string;
  };
  publicHostName: string;
  normalizedHostName: string;
  primaryStreamingPlatform: StreamingPlatform;
  primaryStreamingProfileUrl: string;
  country: string;
  biography?: string | null;
  acceptedGenres?: string | null;
  exampleLivestreamLinks?: string | null;
  payoutOnboardingStatus: string;
  status: HostApplicationStatus;
  reviewedByUserId?: string | null;
  rejectionReasonCode?: string | null;
  internalRejectionNotes?: string | null;
  userFacingRejectionReason?: string | null;
  submittedAt: Date | string;
  reviewedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  stripeConnected: boolean;
  stripeAccountId?: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  isEligibleForApproval: boolean;
  stationSlug?: string | null;
}

export type AdminHostApplicationDetail = HostApplicationSummary;

export interface HostOnboardingStatus {
  hasApplication: boolean;
  application: HostApplicationSummary | null;
  stripeConnected: boolean;
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  isEligibleForApproval: boolean;
  isApproved: boolean;
  status: HostApplicationStatus | "NOT_STARTED";
  station: StationSummary | null;
  requireManualHostApproval: boolean;
}

export interface CreateHostApplicationDto {
  publicHostName: string;
  primaryStreamingPlatform: StreamingPlatform;
  primaryStreamingProfileUrl: string;
  country: string;
  biography?: string;
  acceptedGenres?: string;
  exampleLivestreamLinks?: string;
  acceptHostTerms: boolean;
  termsVersion?: string;
}

export interface StripeConnectLinkResponse {
  accountLinkUrl: string;
  accountId: string;
  expiresAt?: Date | string;
}

export interface StripeConnectStatusResponse {
  connected: boolean;
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  isComplete: boolean;
}

export interface UpdateStationDto {
  description?: string | null;
  primaryStreamingPlatform?: StreamingPlatform;
  streamUrl?: string | null;
  acceptedContentRules?: string | null;
  explicitContentAllowed?: boolean;
  maxTrackDurationSeconds?: number;
  maxQueueSize?: number;
}

export interface GoLiveDto {
  liveTitle: string;
  primaryStreamingPlatform: StreamingPlatform;
  streamUrl?: string | null;
  submissionsOpen?: boolean;
  freeLineOpen?: boolean;
  paidSubmissionsOpen?: boolean;
}

// ============================================================================
// Legal & Terms of Service Models
// ============================================================================

export type LegalAcceptanceSource =
  | "SIGNUP"
  | "HOST_APPLICATION"
  | "HOST_GO_LIVE"
  | "TERMS_UPDATE"
  | "STATION_ACTIVATION";

export interface LegalDocumentMetadata {
  slug: string;
  title: string;
  version: string;
  effectiveDate: string;
  lastUpdated: string;
  legalEntityName: string;
  legalContactEmail: string;
  copyrightContactEmail: string;
  legalMailingAddress: string;
  governingJurisdiction: string;
  sectionsCount: number;
}

export interface LegalAcceptanceRecord {
  id: string;
  userId: string;
  documentSlug: string;
  version: string;
  acceptanceSource: LegalAcceptanceSource;
  acceptedAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RecordLegalAcceptanceDto {
  documentSlug?: string;
  version: string;
  acceptanceSource: LegalAcceptanceSource;
}

export interface LegalAcceptanceStatusResponse {
  currentVersion: string;
  isAccepted: boolean;
  lastAcceptedVersion?: string | null;
  lastAcceptedAt?: string | null;
  history: LegalAcceptanceRecord[];
}


