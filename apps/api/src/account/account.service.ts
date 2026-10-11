import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { hashPassword, verifyPassword } from "@platform/auth";
import type {
  ArtistIdentity,
  ArtistIdentitySummary,
  SecurityEventLog,
  UserPreferencesDto,
  UserProfile,
  UserSessionInfo,
} from "@platform/types";
import type {
  ChangePasswordInput,
  CreateArtistIdentityInput,
  UpdateArtistIdentityInput,
  UpdateUserProfileInput,
} from "@platform/validation";
import { SecurityEventRepository } from "../auth/repositories/security-event.repository";
import { SessionRepository } from "../auth/repositories/session.repository";
import { toUserProfile, USER_PROFILE_INCLUDE } from "../common/user-profile.mapper";

const DEFAULT_PREFERENCES: UserPreferencesDto = {
  emailNotifications: true,
  marketingEmails: false,
  soundEffects: true,
  themeMode: "dark",
};

const emptyToNull = (v: string | null | undefined) =>
  v === undefined ? undefined : v && v.trim() ? v.trim() : null;

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly securityEvents: SecurityEventRepository,
    private readonly sessions: SessionRepository,
  ) {}

  // --------------------------------------------------------------------------
  // Profile
  // --------------------------------------------------------------------------

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: USER_PROFILE_INCLUDE,
    });
    if (!user) throw new NotFoundException("Account not found");
    return toUserProfile(user);
  }

  async updateProfile(
    userId: string,
    input: UpdateUserProfileInput,
    meta: { ipAddress: string; userAgent?: string },
  ): Promise<UserProfile> {
    await this.prisma.$transaction(async (tx) => {
      if (input.displayName !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: { displayName: input.displayName.trim() },
        });
      }
      const profileData = {
        biography: emptyToNull(input.bio),
        avatarUrl: emptyToNull(input.avatarUrl),
        country: emptyToNull(input.country),
        websiteUrl: emptyToNull(input.websiteUrl),
        spotifyProfileUrl: emptyToNull(input.spotifyProfileUrl),
      };
      await tx.userProfile.upsert({
        where: { userId },
        create: { id: generateUuidV7(), userId, ...profileData },
        update: profileData,
      });
      await this.securityEvents.logEvent(tx, {
        userId,
        eventType: "PROFILE_UPDATED",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });
    return this.getProfile(userId);
  }

  async changePassword(
    userId: string,
    currentSessionId: string | undefined,
    input: ChangePasswordInput,
    meta: { ipAddress: string; userAgent?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Account not found");
    if (!input.currentPassword || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new BadRequestException({
        message: "Current password is incorrect",
        code: "INVALID_CREDENTIALS",
      });
    }
    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      // Sign out every other device; keep the session that made the change
      await this.sessions.revokeAllUserSessions(tx, userId, "PASSWORD_CHANGED", currentSessionId);
      await this.securityEvents.logEvent(tx, {
        userId,
        eventType: "PASSWORD_CHANGED",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    });
    return { success: true, message: "Password changed. Other devices have been signed out." };
  }

  // --------------------------------------------------------------------------
  // Sessions & security log
  // --------------------------------------------------------------------------

  async listSessions(userId: string, currentSessionId?: string): Promise<UserSessionInfo[]> {
    const rows = await this.sessions.findActiveUserSessions(userId);
    return rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      isCurrent: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string, meta: { ipAddress: string }) {
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new NotFoundException("Session not found");
    await this.prisma.$transaction(async (tx) => {
      await this.sessions.revokeSession(tx, sessionId, "USER_REVOKED");
      await this.securityEvents.logEvent(tx, {
        userId,
        eventType: "SESSION_REVOKED",
        ipAddress: meta.ipAddress,
      });
    });
    return { success: true, message: "Session revoked" };
  }

  async securityLog(userId: string): Promise<SecurityEventLog[]> {
    const rows = await this.prisma.userSecurityEvent.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      createdAt: r.timestamp.toISOString(),
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
    }));
  }

  // --------------------------------------------------------------------------
  // Preferences (key/value rows)
  // --------------------------------------------------------------------------

  async getPreferences(userId: string): Promise<UserPreferencesDto> {
    const rows = await this.prisma.userPreference.findMany({ where: { userId } });
    const prefs: UserPreferencesDto = { ...DEFAULT_PREFERENCES };
    for (const row of rows) {
      if (row.key === "themeMode") {
        prefs.themeMode = row.value === "system" ? "system" : "dark";
      } else if (row.key in prefs) {
        (prefs as any)[row.key] = row.value === "true";
      }
    }
    return prefs;
  }

  async updatePreferences(userId: string, input: Partial<UserPreferencesDto>) {
    const allowed: (keyof UserPreferencesDto)[] = [
      "emailNotifications",
      "marketingEmails",
      "soundEffects",
      "themeMode",
    ];
    await this.prisma.$transaction(
      allowed
        .filter((key) => input[key] !== undefined)
        .map((key) => {
          const value =
            key === "themeMode"
              ? input.themeMode === "system"
                ? "system"
                : "dark"
              : String(Boolean(input[key]));
          return this.prisma.userPreference.upsert({
            where: { userId_key: { userId, key } },
            create: { id: generateUuidV7(), userId, key, value },
            update: { value },
          });
        }),
    );
    return this.getPreferences(userId);
  }

  // --------------------------------------------------------------------------
  // Artist identities
  // --------------------------------------------------------------------------

  private toArtist(row: any): ArtistIdentity {
    return {
      id: row.id,
      userId: row.userId,
      artistName: row.artistName,
      normalizedArtistName: row.normalizedArtistName,
      spotifyUrl: row.spotifyUrl,
      biography: row.biography,
      profileImageKey: row.profileImageKey,
      isDefault: row.isDefault,
      isPublic: row.isPublic,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    };
  }

  async listArtists(userId: string): Promise<ArtistIdentitySummary[]> {
    const rows = await this.prisma.artistIdentity.findMany({
      where: { userId, deletedAt: null },
      include: { _count: { select: { tracks: true, submissions: true } } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      artistName: r.artistName,
      spotifyUrl: r.spotifyUrl,
      biography: r.biography,
      profileImageKey: r.profileImageKey,
      isDefault: r.isDefault,
      trackCount: r._count.tracks,
      submissionCount: r._count.submissions,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  private async ownedArtist(userId: string, id: string) {
    const row = await this.prisma.artistIdentity.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw new NotFoundException("Artist identity not found");
    if (row.userId !== userId) throw new ForbiddenException("You do not own this artist identity");
    return row;
  }

  async getArtist(userId: string, id: string): Promise<ArtistIdentity> {
    return this.toArtist(await this.ownedArtist(userId, id));
  }

  async createArtist(userId: string, input: CreateArtistIdentityInput): Promise<ArtistIdentity> {
    const row = await this.prisma.$transaction(async (tx) => {
      const count = await tx.artistIdentity.count({ where: { userId, deletedAt: null } });
      const makeDefault = input.isDefault || count === 0;
      if (makeDefault) {
        await tx.artistIdentity.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.artistIdentity.create({
        data: {
          id: generateUuidV7(),
          userId,
          artistName: input.artistName,
          normalizedArtistName: input.artistName.toLowerCase(),
          spotifyUrl: input.spotifyUrl ?? null,
          biography: emptyToNull(input.biography ?? undefined) ?? null,
          profileImageKey: input.profileImageKey ?? null,
          isDefault: makeDefault,
        },
      });
    });
    return this.toArtist(row);
  }

  async updateArtist(
    userId: string,
    id: string,
    input: UpdateArtistIdentityInput,
  ): Promise<ArtistIdentity> {
    await this.ownedArtist(userId, id);
    const row = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.artistIdentity.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.artistIdentity.update({
        where: { id },
        data: {
          ...(input.artistName !== undefined
            ? { artistName: input.artistName, normalizedArtistName: input.artistName.toLowerCase() }
            : {}),
          ...(input.spotifyUrl !== undefined ? { spotifyUrl: input.spotifyUrl ?? null } : {}),
          ...(input.biography !== undefined ? { biography: emptyToNull(input.biography) ?? null } : {}),
          ...(input.profileImageKey !== undefined ? { profileImageKey: input.profileImageKey ?? null } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        },
      });
    });
    return this.toArtist(row);
  }

  /** Soft delete: past tracks and submissions keep their attribution. */
  async deleteArtist(userId: string, id: string) {
    const row = await this.ownedArtist(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.artistIdentity.update({
        where: { id },
        data: { deletedAt: new Date(), isDefault: false },
      });
      if (row.isDefault) {
        const next = await tx.artistIdentity.findFirst({
          where: { userId, deletedAt: null },
          orderBy: { createdAt: "asc" },
        });
        if (next) {
          await tx.artistIdentity.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });
    return { success: true, message: "Artist identity removed." };
  }
}
