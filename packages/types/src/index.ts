export enum AccountStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
}

export enum HostApplicationStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum LiveSessionStatus {
  OFFLINE = 'OFFLINE',
  LIVE = 'LIVE',
  PAUSED = 'PAUSED',
}

export enum SubmissionStatus {
  PENDING = 'PENDING',
  PLAYING = 'PLAYING',
  PLAYED = 'PLAYED',
  SKIPPED = 'SKIPPED',
  REJECTED = 'REJECTED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  DISPUTED = 'DISPUTED',
}

export enum StreamingPlatform {
  TIKTOK = 'TIKTOK',
  TWITCH = 'TWITCH',
  KICK = 'KICK',
  YOUTUBE = 'YOUTUBE',
  FACEBOOK = 'FACEBOOK',
}

export enum AuditAction {
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_UPDATE = 'USER_UPDATE',
  HOST_APPLICATION_SUBMIT = 'HOST_APPLICATION_SUBMIT',
  HOST_APPLICATION_REVIEW = 'HOST_APPLICATION_REVIEW',
  STATION_UPDATE = 'STATION_UPDATE',
  LIVE_SESSION_START = 'LIVE_SESSION_START',
  LIVE_SESSION_END = 'LIVE_SESSION_END',
  SUBMISSION_CREATE = 'SUBMISSION_CREATE',
  SUBMISSION_STATUS_UPDATE = 'SUBMISSION_STATUS_UPDATE',
  PAYMENT_INTENT_CREATE = 'PAYMENT_INTENT_CREATE',
  PAYMENT_COMPLETE = 'PAYMENT_COMPLETE',
  PAYMENT_REFUND = 'PAYMENT_REFUND',
  USER_BAN = 'USER_BAN',
  USER_UNBAN = 'USER_UNBAN',
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  isHost: boolean;
  isAdmin: boolean;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}
