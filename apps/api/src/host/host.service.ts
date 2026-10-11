import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { TERMS_METADATA } from "@platform/config";
import {
  RESERVED_SLUGS,
  slugifyHostname,
  MAX_ACTIVE_PRIORITY_TIERS,
} from "@platform/validation";
import type {
  CreateHostApplicationInput,
  CreateStationPriorityTierInput,
  GoLiveInput,
  UpdateStationInput,
  UpdateStationPriorityTierInput,
} from "@platform/validation";
import {
  HostApplicationStatus,
  LiveSessionStatus,
  Role,
  StationStatus,
  StreamingPlatform,
} from "@platform/types";
import type {
  HostApplicationSummary,
  HostOnboardingStatus,
  HostStationDetail,
  StationPriorityTier,
  StationSummary,
  StripeConnectLinkResponse,
  StripeConnectStatusResponse,
} from "@platform/types";
import { StripeService } from "../payments/stripe.service";
import { LegalService } from "../legal/legal.service";
import { PlatformSettingsService } from "../platform/platform-settings.service";
import { LiveSessionsService } from "../live-sessions/live-sessions.service";
import { LiveSessionsEventService } from "../live-sessions/live-sessions-event.service";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const ACTIVE_SESSION_STATES = [
  LiveSessionStatus.SCHEDULED,
  LiveSessionStatus.PREPARING,
  LiveSessionStatus.LIVE,
  LiveSessionStatus.PAUSED,
];

const REVIEWABLE_STATES = [
  HostApplicationStatus.SUBMITTED,
  HostApplicationStatus.UNDER_REVIEW,
  HostApplicationStatus.PAYMENT_VERIFICATION_REQUIRED,
  HostApplicationStatus.MORE_INFORMATION_REQUIRED,
];

const DEFAULT_TIERS = [
  {
    name: "Priority Jump",
    description: "Jump ahead of the free line to the top of the queue.",
    priceCents: 500,
    priorityRank: 1,
    colorSlot: "TIER_COLOR_2" as const,
  },
  {
    name: "VIP Review",
    description: "Top priority with a guaranteed full listen and live feedback.",
    priceCents: 1500,
    priorityRank: 2,
    colorSlot: "TIER_COLOR_1" as const,
  },
];

/** Accepts ISO codes or common names; returns undefined when unsure. */
function toCountryCode(country: string | null | undefined): string | undefined {
  if (!country) return undefined;
  const c = country.trim();
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  const map: Record<string, string> = {
    "united states": "US",
    usa: "US",
    "united states of america": "US",
    canada: "CA",
    "united kingdom": "GB",
    uk: "GB",
    "great britain": "GB",
    australia: "AU",
    ireland: "IE",
    "new zealand": "NZ",
    germany: "DE",
    france: "FR",
    netherlands: "NL",
    spain: "ES",
    italy: "IT",
    sweden: "SE",
    norway: "NO",
    denmark: "DK",
    finland: "FI",
    japan: "JP",
    mexico: "MX",
    brazil: "BR",
  };
  return map[c.toLowerCase()];
}

@Injectable()
export class HostService {
  private readonly logger = new Logger(HostService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly stripe: StripeService,
    private readonly legal: LegalService,
    private readonly settings: PlatformSettingsService,
    private readonly liveSessions: LiveSessionsService,
    private readonly events: LiveSessionsEventService,
  ) {}

  /** Local development only: lets onboarding complete without real Stripe keys. */
  private get stripeDevBypass(): boolean {
    return (
      process.env.NODE_ENV !== "production" &&
      process.env.STRIPE_CONNECT_DEV_BYPASS === "true"
    );
  }

  // ==========================================================================
  // Mapping helpers
  // ==========================================================================

  private async uniqueSlug(base: string, tx: Tx = this.prisma): Promise<string> {
    let candidate = slugifyHostname(base).slice(0, 40);
    if (candidate.length < 3) candidate = `${candidate}-live`.replace(/^-/, "");
    if ((RESERVED_SLUGS as readonly string[]).includes(candidate)) candidate = `${candidate}-live`;
    for (let n = 1; n < 1000; n++) {
      const slug = n === 1 ? candidate : `${candidate}-${n}`;
      const [host, station] = await Promise.all([
        tx.hostProfile.findUnique({ where: { normalizedHostSlug: slug } }),
        tx.station.findUnique({ where: { slug } }),
      ]);
      if (!host && !station) return slug;
    }
    return `${candidate}-${generateUuidV7().slice(-6)}`;
  }

  toStationSummary(
    station: any,
    host: { id: string; publicHostName: string; isApproved: boolean },
    live?: { id: string } | null,
  ): StationSummary {
    return {
      id: station.id,
      hostId: host.id,
      stationName: station.stationName,
      normalizedStationName: station.normalizedStationName,
      slug: station.slug,
      description: station.description,
      profileImageKey: station.profileImageKey,
      bannerImageKey: station.bannerImageKey,
      status: station.status as StationStatus,
      isPublicVisible: station.isPublicVisible,
      isApproved: host.isApproved,
      primaryStreamingPlatform: station.primaryStreamingPlatform as StreamingPlatform,
      streamUrl: station.streamUrl,
      acceptedContentRules: station.acceptedContentRules,
      explicitContentAllowed: station.explicitContentAllowed,
      maxTrackDurationSeconds: station.maxTrackDurationSeconds,
      maxQueueSize: station.maxQueueSize,
      isLive: Boolean(live),
      currentLiveSessionId: live?.id ?? null,
      hostName: host.publicHostName,
      createdAt: station.createdAt.toISOString(),
      updatedAt: station.updatedAt.toISOString(),
    };
  }

  private stripeFlags(payout: any) {
    const connected = Boolean(payout?.providerAccountId);
    const detailsSubmitted = Boolean(payout?.onboardingState === "COMPLETED" || payout?.isIdentityVerified);
    const chargesEnabled = Boolean(payout?.chargesEnabled);
    const payoutsEnabled = Boolean(payout?.payoutsEnabled);
    return {
      connected,
      accountId: payout?.providerAccountId ?? null,
      detailsSubmitted,
      chargesEnabled,
      payoutsEnabled,
      isComplete: connected && detailsSubmitted && chargesEnabled && payoutsEnabled,
    };
  }

  private toApplicationSummary(app: any, payout: any, stationSlug: string | null): HostApplicationSummary {
    const review = app.reviews?.[0];
    const s = this.stripeFlags(payout);
    return {
      id: app.id,
      applicantUserId: app.applicantUserId,
      applicantUser: app.applicant
        ? {
            id: app.applicant.id,
            email: app.applicant.email,
            username: app.applicant.username,
            displayName: app.applicant.displayName,
          }
        : undefined,
      publicHostName: app.publicHostName,
      normalizedHostName: app.normalizedHostName,
      primaryStreamingPlatform: app.primaryStreamingPlatform as StreamingPlatform,
      primaryStreamingProfileUrl: app.primaryStreamingProfileUrl,
      country: app.country,
      biography: app.biography,
      acceptedGenres: app.acceptedGenres,
      exampleLivestreamLinks: app.exampleLivestreamLinks,
      payoutOnboardingStatus: s.isComplete ? "COMPLETED" : s.connected ? "IN_PROGRESS" : "NOT_STARTED",
      status: app.status as HostApplicationStatus,
      reviewedByUserId: review?.reviewerUserId ?? null,
      rejectionReasonCode: review?.decision === "REJECTED" ? "REJECTED" : null,
      internalRejectionNotes: review?.decision === "REJECTED" ? review?.internalNotes ?? null : null,
      userFacingRejectionReason: review?.decision === "REJECTED" ? review?.userVisibleNotes ?? null : null,
      submittedAt: (app.submittedAt ?? app.createdAt).toISOString(),
      reviewedAt: review?.reviewedAt?.toISOString() ?? null,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
      stripeConnected: s.connected,
      stripeAccountId: s.accountId,
      stripeChargesEnabled: s.chargesEnabled,
      stripePayoutsEnabled: s.payoutsEnabled,
      stripeDetailsSubmitted: s.detailsSubmitted,
      isEligibleForApproval: s.isComplete,
      stationSlug,
    };
  }

  private applicationInclude = {
    applicant: true,
    reviews: { orderBy: { reviewedAt: "desc" as const }, take: 1 },
  };

  async loadHostContext(userId: string) {
    const hostProfile = await this.prisma.hostProfile.findUnique({
      where: { userId },
      include: {
        payoutAccounts: { where: { isPrimary: true }, take: 1 },
        stations: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    return {
      hostProfile,
      payout: hostProfile?.payoutAccounts[0] ?? null,
      station: hostProfile?.stations[0] ?? null,
    };
  }

  /** Approved host with a station, or 403/404. */
  async requireApprovedHost(userId: string) {
    const ctx = await this.loadHostContext(userId);
    if (!ctx.hostProfile || !ctx.hostProfile.isApproved || ctx.hostProfile.suspendedAt || ctx.hostProfile.revokedAt) {
      throw new ForbiddenException("An approved host account is required");
    }
    if (!ctx.station) throw new NotFoundException("Station not found");
    return { hostProfile: ctx.hostProfile, payout: ctx.payout, station: ctx.station };
  }

  private async activeSessionFor(stationId: string) {
    return this.prisma.liveSession.findFirst({
      where: { stationId, status: { in: [LiveSessionStatus.LIVE, LiveSessionStatus.PAUSED] } },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
  }

  // ==========================================================================
  // Onboarding
  // ==========================================================================

  async onboardingStatus(userId: string): Promise<HostOnboardingStatus> {
    const [app, ctx, settings] = await Promise.all([
      this.prisma.hostApplication.findFirst({
        where: { applicantUserId: userId },
        orderBy: { createdAt: "desc" },
        include: this.applicationInclude,
      }),
      this.loadHostContext(userId),
      this.settings.get(),
    ]);
    const s = this.stripeFlags(ctx.payout);
    const station =
      ctx.station && ctx.hostProfile
        ? this.toStationSummary(ctx.station, ctx.hostProfile, await this.activeSessionFor(ctx.station.id))
        : null;
    const isApproved = Boolean(ctx.hostProfile?.isApproved && station);
    return {
      hasApplication: Boolean(app),
      application: app ? this.toApplicationSummary(app, ctx.payout, station?.slug ?? null) : null,
      stripeConnected: s.connected,
      stripeAccountId: s.accountId,
      stripeChargesEnabled: s.chargesEnabled,
      stripePayoutsEnabled: s.payoutsEnabled,
      stripeDetailsSubmitted: s.detailsSubmitted,
      isEligibleForApproval: s.isComplete,
      isApproved,
      status: app ? (app.status as HostApplicationStatus) : isApproved ? HostApplicationStatus.APPROVED : "NOT_STARTED",
      station,
      requireManualHostApproval: settings.requireManualHostApproval,
    };
  }

  async apply(
    user: { id: string },
    input: CreateHostApplicationInput,
    meta: { ipAddress: string; userAgent?: string },
  ): Promise<HostApplicationSummary> {
    const existing = await this.prisma.hostApplication.findFirst({
      where: {
        applicantUserId: user.id,
        status: { notIn: [HostApplicationStatus.REJECTED, HostApplicationStatus.WITHDRAWN] },
      },
    });
    if (existing) {
      throw new ConflictException({
        message: "You already have a host application",
        code: "APPLICATION_EXISTS",
      });
    }

    const appId = await this.prisma.$transaction(async (tx) => {
      const id = generateUuidV7();
      await tx.hostApplication.create({
        data: {
          id,
          applicantUserId: user.id,
          publicHostName: input.publicHostName.trim(),
          normalizedHostName: input.publicHostName.trim().toLowerCase(),
          country: input.country.trim(),
          primaryStreamingPlatform: input.primaryStreamingPlatform,
          primaryStreamingProfileUrl: input.primaryStreamingProfileUrl,
          biography: input.biography ?? null,
          acceptedGenres: input.acceptedGenres ?? null,
          exampleLivestreamLinks: input.exampleLivestreamLinks ?? null,
          status: HostApplicationStatus.SUBMITTED,
          submittedAt: new Date(),
          statusHistory: {
            create: {
              id: generateUuidV7(),
              newStatus: HostApplicationStatus.SUBMITTED,
              changedByUserId: user.id,
            },
          },
        },
      });

      // The host profile exists (unapproved) from the start so the Stripe
      // Connect account can be attached to it during onboarding.
      const hostProfile = await tx.hostProfile.findUnique({ where: { userId: user.id } });
      if (!hostProfile) {
        const slug = await this.uniqueSlug(input.publicHostName, tx);
        await tx.hostProfile.create({
          data: {
            id: generateUuidV7(),
            userId: user.id,
            publicHostName: input.publicHostName.trim(),
            normalizedHostName: input.publicHostName.trim().toLowerCase(),
            biography: input.biography ?? null,
            country: input.country.trim(),
            isApproved: false,
            isPublicVisible: false,
            hostSlug: slug,
            normalizedHostSlug: slug,
          },
        });
      }

      for (const slug of ["terms", "host-agreement"]) {
        await this.legal.recordAcceptance(
          {
            userId: user.id,
            documentSlug: slug,
            version: input.termsVersion || TERMS_METADATA.version,
            source: "HOST_APPLICATION",
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
          },
          tx,
        );
      }
      await tx.userSecurityEvent.create({
        data: {
          id: generateUuidV7(),
          userId: user.id,
          eventType: "HOST_APPLICATION_SUBMITTED",
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        },
      });
      return id;
    });

    await this.maybeAutoApprove(user.id);
    return this.applicationById(appId);
  }

  private async applicationById(id: string): Promise<HostApplicationSummary> {
    const app = await this.prisma.hostApplication.findUniqueOrThrow({
      where: { id },
      include: this.applicationInclude,
    });
    const ctx = await this.loadHostContext(app.applicantUserId);
    return this.toApplicationSummary(app, ctx.payout, ctx.station?.slug ?? null);
  }

  async listApplications(status?: string): Promise<HostApplicationSummary[]> {
    const apps = await this.prisma.hostApplication.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { submittedAt: "desc" },
      include: this.applicationInclude,
    });
    const profiles = await this.prisma.hostProfile.findMany({
      where: { userId: { in: apps.map((a) => a.applicantUserId) } },
      include: {
        payoutAccounts: { where: { isPrimary: true }, take: 1 },
        stations: { where: { deletedAt: null }, take: 1 },
      },
    });
    const byUser = new Map(profiles.map((p) => [p.userId, p]));
    return apps.map((a) => {
      const p = byUser.get(a.applicantUserId);
      return this.toApplicationSummary(a, p?.payoutAccounts[0], p?.stations[0]?.slug ?? null);
    });
  }

  /** Approves when manual review is off and Stripe onboarding is complete. */
  async maybeAutoApprove(userId: string): Promise<boolean> {
    const settings = await this.settings.get();
    if (settings.requireManualHostApproval) return false;
    const app = await this.prisma.hostApplication.findFirst({
      where: { applicantUserId: userId, status: { in: REVIEWABLE_STATES } },
      orderBy: { createdAt: "desc" },
    });
    if (!app) return false;
    const { payout } = await this.loadHostContext(userId);
    if (!this.stripeFlags(payout).isComplete) return false;
    await this.approveApplication(app.id, null);
    return true;
  }

  /**
   * Approves an application: grants the HOST role, activates the host profile,
   * and creates the station with starter tiers. `actorUserId` null = automatic.
   */
  async approveApplication(applicationId: string, actorUserId: string | null) {
    const app = await this.prisma.hostApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException("Host application not found");
    if (app.status === HostApplicationStatus.APPROVED) {
      throw new ConflictException("Application is already approved");
    }
    const ctx = await this.loadHostContext(app.applicantUserId);
    if (!ctx.hostProfile) throw new ConflictException("Host profile missing for this application");
    if (!this.stripeFlags(ctx.payout).isComplete) {
      throw new ConflictException({
        message: "Cannot approve: the applicant has not finished Stripe Connect onboarding",
        code: "STRIPE_ONBOARDING_INCOMPLETE",
      });
    }

    const stationId = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.userRoleAssignment.upsert({
        where: { userId_role: { userId: app.applicantUserId, role: Role.HOST } },
        create: { id: generateUuidV7(), userId: app.applicantUserId, role: Role.HOST },
        update: {},
      });
      await tx.user.update({ where: { id: app.applicantUserId }, data: { isHost: true } });
      await tx.hostProfile.update({
        where: { id: ctx.hostProfile!.id },
        data: {
          isApproved: true,
          approvedAt: now,
          isPublicVisible: true,
          suspendedAt: null,
          revokedAt: null,
        },
      });

      let station = await tx.station.findFirst({
        where: { hostId: ctx.hostProfile!.id, deletedAt: null },
      });
      if (!station) {
        const slugTaken = await tx.station.findUnique({ where: { slug: ctx.hostProfile!.hostSlug } });
        const slug = slugTaken ? await this.uniqueSlug(ctx.hostProfile!.hostSlug, tx) : ctx.hostProfile!.hostSlug;
        station = await tx.station.create({
          data: {
            id: generateUuidV7(),
            hostId: ctx.hostProfile!.id,
            stationName: app.publicHostName,
            normalizedStationName: app.normalizedHostName,
            slug,
            description: app.biography,
            acceptedContentRules: app.acceptedGenres ? `Genres: ${app.acceptedGenres}` : null,
            primaryStreamingPlatform: app.primaryStreamingPlatform as any,
            streamUrl: app.primaryStreamingProfileUrl,
            maxTrackDurationSeconds: 600,
            maxQueueSize: 100,
          },
        });
        for (const [i, tier] of DEFAULT_TIERS.entries()) {
          await tx.priorityTier.create({
            data: { id: generateUuidV7(), stationId: station.id, displayOrder: i + 1, ...tier },
          });
        }
      } else {
        await tx.station.update({
          where: { id: station.id },
          data: { status: StationStatus.ACTIVE, statusChangedAt: now },
        });
      }

      await tx.hostApplication.update({
        where: { id: app.id },
        data: {
          status: HostApplicationStatus.APPROVED,
          payoutOnboardingStatus: "COMPLETED",
          statusHistory: {
            create: {
              id: generateUuidV7(),
              previousStatus: app.status,
              newStatus: HostApplicationStatus.APPROVED,
              changedByUserId: actorUserId,
              notes: actorUserId ? null : "Automatically approved (manual review disabled)",
            },
          },
          reviews: {
            create: {
              id: generateUuidV7(),
              reviewerUserId: actorUserId ?? app.applicantUserId,
              decision: actorUserId ? "APPROVED" : "AUTO_APPROVED",
            },
          },
        },
      });
      if (actorUserId) {
        await tx.adminAuditLog.create({
          data: {
            id: generateUuidV7(),
            actingAdminUserId: actorUserId,
            actionType: "HOST_APPROVED",
            targetEntityType: "HostApplication",
            targetEntityId: app.id,
            reason: "Host application approved",
          },
        });
      }
      return station.id;
    });

    const station = await this.prisma.station.findUniqueOrThrow({ where: { id: stationId } });
    const host = await this.prisma.hostProfile.findUniqueOrThrow({ where: { id: station.hostId } });
    return { success: true, message: "Host approved and station created.", station: this.toStationSummary(station, host, null) };
  }

  async rejectApplication(applicationId: string, actorUserId: string, reason?: string) {
    const app = await this.prisma.hostApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException("Host application not found");
    if (!REVIEWABLE_STATES.includes(app.status as HostApplicationStatus)) {
      throw new ConflictException(`Cannot reject an application that is ${app.status}`);
    }
    await this.prisma.hostApplication.update({
      where: { id: app.id },
      data: {
        status: HostApplicationStatus.REJECTED,
        statusHistory: {
          create: {
            id: generateUuidV7(),
            previousStatus: app.status,
            newStatus: HostApplicationStatus.REJECTED,
            changedByUserId: actorUserId,
            notes: reason ?? null,
          },
        },
        reviews: {
          create: {
            id: generateUuidV7(),
            reviewerUserId: actorUserId,
            decision: "REJECTED",
            userVisibleNotes: reason ?? null,
            internalNotes: reason ?? null,
          },
        },
      },
    });
    await this.prisma.adminAuditLog.create({
      data: {
        id: generateUuidV7(),
        actingAdminUserId: actorUserId,
        actionType: "HOST_REJECTED",
        targetEntityType: "HostApplication",
        targetEntityId: app.id,
        reason: reason || "Host application rejected",
      },
    });
    return { success: true, message: "Application rejected." };
  }

  /** Suspends hosting: ends any live session, hides the station, removes HOST role. */
  async suspendHost(applicationId: string, actorUserId: string, reason?: string) {
    const app = await this.prisma.hostApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException("Host application not found");
    const ctx = await this.loadHostContext(app.applicantUserId);
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      if (ctx.hostProfile) {
        await tx.hostProfile.update({
          where: { id: ctx.hostProfile.id },
          data: { isApproved: false, suspendedAt: now, isPublicVisible: false },
        });
        await tx.station.updateMany({
          where: { hostId: ctx.hostProfile.id },
          data: { status: StationStatus.INACTIVE, statusChangedAt: now },
        });
        await tx.liveSession.updateMany({
          where: { hostId: app.applicantUserId, status: { in: ACTIVE_SESSION_STATES } },
          data: { status: LiveSessionStatus.ENDED, endedAt: now, submissionsOpen: false },
        });
      }
      await tx.userRoleAssignment.deleteMany({
        where: { userId: app.applicantUserId, role: Role.HOST },
      });
      await tx.user.update({ where: { id: app.applicantUserId }, data: { isHost: false } });
      await tx.hostApplication.update({
        where: { id: app.id },
        data: {
          status: HostApplicationStatus.SUSPENDED,
          statusHistory: {
            create: {
              id: generateUuidV7(),
              previousStatus: app.status,
              newStatus: HostApplicationStatus.SUSPENDED,
              changedByUserId: actorUserId,
              notes: reason ?? null,
            },
          },
        },
      });
      await tx.adminAuditLog.create({
        data: {
          id: generateUuidV7(),
          actingAdminUserId: actorUserId,
          actionType: "HOST_SUSPENDED",
          targetEntityType: "HostApplication",
          targetEntityId: app.id,
          reason: reason || "Host suspended",
        },
      });
    });
    return { success: true, message: "Host suspended." };
  }

  // ==========================================================================
  // Stripe Connect
  // ==========================================================================

  async createStripeConnectLink(user: { id: string; email: string }): Promise<StripeConnectLinkResponse> {
    const app = await this.prisma.hostApplication.findFirst({
      where: { applicantUserId: user.id },
      orderBy: { createdAt: "desc" },
    });
    const ctx = await this.loadHostContext(user.id);
    if (!app || !ctx.hostProfile) {
      throw new BadRequestException("Submit a host application before connecting Stripe");
    }
    const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

    let accountId = ctx.payout?.providerAccountId;
    if (!accountId) {
      if (this.stripeDevBypass) {
        accountId = `acct_dev_${ctx.hostProfile.id.replace(/-/g, "").slice(0, 16)}`;
      } else {
        const account = await this.stripe.createExpressAccount({
          email: user.email,
          country: toCountryCode(app.country),
          userId: user.id,
          hostProfileId: ctx.hostProfile.id,
          profileUrl: app.primaryStreamingProfileUrl,
        });
        accountId = account.id;
      }
      await this.prisma.hostPayoutAccount.create({
        data: {
          id: generateUuidV7(),
          hostId: ctx.hostProfile.id,
          providerAccountId: accountId,
          country: toCountryCode(app.country) ?? app.country,
          onboardingState: "IN_PROGRESS",
        },
      });
    }

    if (this.stripeDevBypass) {
      return {
        accountLinkUrl: `${webUrl}/host/onboarding?stripe_connect=return`,
        accountId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };
    }
    const link = await this.stripe.createOnboardingLink(
      accountId,
      `${webUrl}/host/onboarding?stripe_connect=return`,
      `${webUrl}/host/onboarding?stripe_connect=refresh`,
    );
    return {
      accountLinkUrl: link.url,
      accountId,
      expiresAt: new Date(link.expires_at * 1000).toISOString(),
    };
  }

  async getStripeStatus(userId: string): Promise<StripeConnectStatusResponse> {
    const { payout } = await this.loadHostContext(userId);
    return this.stripeFlags(payout);
  }

  /** Pulls the latest account state from Stripe (also done by the account.updated webhook). */
  async syncStripeStatus(userId: string): Promise<StripeConnectStatusResponse> {
    const { payout } = await this.loadHostContext(userId);
    if (!payout) return this.stripeFlags(null);
    if (this.stripeDevBypass && payout.providerAccountId.startsWith("acct_dev_")) {
      await this.applyStripeAccountState(payout.providerAccountId, {
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: true,
      });
    } else {
      const account = await this.stripe.retrieveAccount(payout.providerAccountId);
      await this.applyStripeAccountState(account.id, account);
    }
    await this.maybeAutoApprove(userId);
    return this.getStripeStatus(userId);
  }

  /** Shared by the status sync and the account.updated webhook. */
  async applyStripeAccountState(
    accountId: string,
    account: { details_submitted?: boolean; charges_enabled?: boolean; payouts_enabled?: boolean },
  ): Promise<{ userId: string } | null> {
    const payout = await this.prisma.hostPayoutAccount.findUnique({
      where: { providerAccountId: accountId },
      include: { host: true },
    });
    if (!payout) return null;
    const complete = Boolean(account.details_submitted && account.charges_enabled && account.payouts_enabled);
    await this.prisma.hostPayoutAccount.update({
      where: { id: payout.id },
      data: {
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
        isIdentityVerified: Boolean(account.details_submitted),
        onboardingState: complete ? "COMPLETED" : "IN_PROGRESS",
        lastVerifiedAt: new Date(),
      },
    });
    return { userId: payout.host.userId };
  }

  /** Link into the host's Stripe Express dashboard (balances, payouts, tax forms). */
  async stripeDashboardLink(userId: string): Promise<{ url: string }> {
    const { payout } = await this.loadHostContext(userId);
    if (!payout) throw new NotFoundException("No Stripe account connected");
    if (this.stripeDevBypass && payout.providerAccountId.startsWith("acct_dev_")) {
      return { url: "https://dashboard.stripe.com/test/connect/accounts/overview" };
    }
    return { url: await this.stripe.createDashboardLoginLink(payout.providerAccountId) };
  }

  // ==========================================================================
  // Station
  // ==========================================================================

  async getStation(userId: string): Promise<HostStationDetail> {
    const { hostProfile, station } = await this.requireApprovedHost(userId);
    const live = await this.activeSessionFor(station.id);
    return {
      ...this.toStationSummary(station, hostProfile, live),
      currentSessionId: live?.id ?? null,
    };
  }

  async updateStation(userId: string, input: UpdateStationInput): Promise<StationSummary> {
    const { hostProfile, station } = await this.requireApprovedHost(userId);
    const updated = await this.prisma.station.update({
      where: { id: station.id },
      data: {
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.primaryStreamingPlatform ? { primaryStreamingPlatform: input.primaryStreamingPlatform } : {}),
        ...(input.streamUrl !== undefined ? { streamUrl: input.streamUrl || null } : {}),
        ...(input.acceptedContentRules !== undefined ? { acceptedContentRules: input.acceptedContentRules || null } : {}),
        ...(input.explicitContentAllowed !== undefined ? { explicitContentAllowed: input.explicitContentAllowed } : {}),
        ...(input.maxTrackDurationSeconds !== undefined ? { maxTrackDurationSeconds: input.maxTrackDurationSeconds } : {}),
        ...(input.maxQueueSize !== undefined ? { maxQueueSize: input.maxQueueSize } : {}),
      },
    });
    return this.toStationSummary(updated, hostProfile, await this.activeSessionFor(station.id));
  }

  // ==========================================================================
  // Going live
  // ==========================================================================

  /**
   * Starts a live session: ends any session left open, snapshots the
   * station's tiers and settings (so mid-stream edits never change what
   * people paid for), and opens submissions.
   */
  async goLive(user: { id: string }, input: GoLiveInput, meta: { ipAddress: string; userAgent?: string }) {
    const { hostProfile, payout, station } = await this.requireApprovedHost(user.id);
    if (station.status !== StationStatus.ACTIVE) {
      throw new ForbiddenException("Your station is not active");
    }
    const paidAllowed = this.stripeFlags(payout).isComplete;
    const now = new Date();

    const { sessionId, endedIds } = await this.prisma.$transaction(async (tx) => {
      // Serialize go-live per host
      await tx.$queryRaw`SELECT id FROM "host_profiles" WHERE id = ${hostProfile.id}::uuid FOR UPDATE`;

      const stale = await tx.liveSession.findMany({
        where: { hostId: user.id, status: { in: ACTIVE_SESSION_STATES } },
        select: { id: true },
      });
      if (stale.length) {
        await tx.liveSession.updateMany({
          where: { id: { in: stale.map((s) => s.id) } },
          data: {
            status: LiveSessionStatus.ENDED,
            endedAt: now,
            submissionsOpen: false,
            queueRevision: { increment: 1 },
          },
        });
      }

      const id = generateUuidV7();
      const streamUrl = input.streamUrl || station.streamUrl || null;
      await tx.liveSession.create({
        data: {
          id,
          stationId: station.id,
          hostId: user.id,
          status: LiveSessionStatus.LIVE,
          liveTitle: input.liveTitle.trim(),
          startedAt: now,
          lastPlaybackActivityAt: now,
          submissionsOpen: input.submissionsOpen,
          freeLineOpen: input.freeLineOpen,
          paidSubmissionsOpen: input.paidSubmissionsOpen && paidAllowed,
          primaryStreamingPlatform: input.primaryStreamingPlatform,
          savedProfileUrlSnapshot: station.streamUrl ?? streamUrl ?? "",
          sessionLiveUrl: streamUrl,
          linkSource: input.streamUrl ? "USER" : "SYSTEM",
          statusHistory: {
            create: { id: generateUuidV7(), newStatus: LiveSessionStatus.LIVE },
          },
          settingsSnapshots: {
            create: {
              id: generateUuidV7(),
              maxTrackDurationSeconds: station.maxTrackDurationSeconds,
              maxQueueSize: station.maxQueueSize,
              repeatsAllowed: station.repeatsAllowed,
              duplicateTracksAllowed: station.duplicateTracksAllowed,
              queuePositionsVisible: station.queuePositionsVisible,
              waitTimeVisible: station.waitTimeVisible,
              explicitContentAllowed: station.explicitContentAllowed,
              publicQueueVisibilityMode: station.publicQueueVisibilityMode,
              showArtworkPublicly: station.showArtworkPublicly,
              showArtistNamePublicly: station.showArtistNamePublicly,
              showSongNamePublicly: station.showSongNamePublicly,
              showTierPublicly: station.showTierPublicly,
              showQueuePositionPublicly: station.showQueuePositionPublicly,
              showCurrentTrackPublicly: station.showCurrentTrackPublicly,
              showRecentlyPlayedPublicly: station.showRecentlyPlayedPublicly,
            },
          },
          freeLineConfigurations: {
            create: { id: generateUuidV7(), isEnabled: input.freeLineOpen },
          },
        },
      });

      const tiers = await tx.priorityTier.findMany({
        where: { stationId: station.id, isActive: true, deletedAt: null },
        orderBy: { displayOrder: "asc" },
      });
      for (const t of tiers) {
        await tx.livePriorityTierSnapshot.create({
          data: {
            id: generateUuidV7(),
            liveSessionId: id,
            priorityTierId: t.id,
            name: t.name,
            description: t.description,
            priceCents: t.priceCents,
            currency: t.currency,
            priorityRank: t.priorityRank,
            isActive: t.isActive,
            isUpgradeEnabled: t.isUpgradeEnabled,
            maxPurchasesPerLive: t.maxPurchasesPerLive,
            maxPurchasesPerUserPerLive: t.maxPurchasesPerUserPerLive,
            maxSimultaneousActiveEntries: t.maxSimultaneousActiveEntries,
            refundPolicyNotes: t.refundPolicyNotes,
            visualMetadata: t.visualMetadata,
            colorSlot: t.colorSlot,
            publicVisible: t.publicVisible,
            displayOrder: t.displayOrder,
          },
        });
      }
      return { sessionId: id, endedIds: stale.map((s) => s.id) };
    });

    for (const ended of endedIds) {
      this.events.emit(ended, "session.ended", { status: LiveSessionStatus.ENDED, endedAt: now });
    }
    await this.legal
      .recordAcceptance({
        userId: user.id,
        documentSlug: "host-agreement",
        version: TERMS_METADATA.version,
        source: "HOST_GO_LIVE",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      })
      .catch((e) => this.logger.warn(`Could not record go-live acceptance: ${e}`));
    this.events.emit(sessionId, "session.started", { status: LiveSessionStatus.LIVE, startedAt: now });
    return this.liveSessions.getPublicLiveSession(sessionId);
  }

  async goOffline(userId: string) {
    const { station } = await this.requireApprovedHost(userId);
    const now = new Date();
    const sessions = await this.prisma.liveSession.findMany({
      where: { stationId: station.id, status: { in: ACTIVE_SESSION_STATES } },
      select: { id: true, status: true },
    });
    if (!sessions.length) return { success: true, message: "You are already offline." };
    await this.prisma.$transaction(
      sessions.flatMap((s) => [
        this.prisma.liveSession.update({
          where: { id: s.id },
          data: {
            status: LiveSessionStatus.ENDED,
            endedAt: now,
            submissionsOpen: false,
            queueRevision: { increment: 1 },
          },
        }),
        this.prisma.liveSessionStatusHistory.create({
          data: {
            id: generateUuidV7(),
            liveSessionId: s.id,
            previousStatus: s.status,
            newStatus: LiveSessionStatus.ENDED,
          },
        }),
      ]),
    );
    for (const s of sessions) {
      this.events.emit(s.id, "session.ended", { status: LiveSessionStatus.ENDED, endedAt: now });
    }
    return { success: true, message: "Broadcast ended." };
  }

  // ==========================================================================
  // Priority tiers (ADR 0026: max 10 active, fixed color slots)
  // ==========================================================================

  private toTier(t: any): StationPriorityTier {
    return {
      id: t.id,
      stationId: t.stationId,
      name: t.name,
      description: t.description,
      priceCents: t.priceCents,
      priorityRank: t.priorityRank,
      colorSlot: t.colorSlot,
      isActive: t.isActive,
      isUpgradeEnabled: t.isUpgradeEnabled,
      sortOrder: t.displayOrder,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  async listTiers(userId: string): Promise<StationPriorityTier[]> {
    const { station } = await this.requireApprovedHost(userId);
    const tiers = await this.prisma.priorityTier.findMany({
      where: { stationId: station.id, deletedAt: null },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    return tiers.map((t) => this.toTier(t));
  }

  private async assertPriceInPlatformRange(priceCents: number) {
    const s = await this.settings.get();
    if (priceCents < s.minimumPriorityPrice || priceCents > s.maximumPriorityPrice) {
      throw new BadRequestException(
        `Tier price must be between $${(s.minimumPriorityPrice / 100).toFixed(2)} and $${(s.maximumPriorityPrice / 100).toFixed(2)}`,
      );
    }
  }

  private async assertActiveTierCapacity(stationId: string, excludingTierId?: string) {
    const active = await this.prisma.priorityTier.count({
      where: { stationId, isActive: true, deletedAt: null, ...(excludingTierId ? { id: { not: excludingTierId } } : {}) },
    });
    if (active >= MAX_ACTIVE_PRIORITY_TIERS) {
      throw new ConflictException(`A station can have at most ${MAX_ACTIVE_PRIORITY_TIERS} active paid tiers`);
    }
  }

  async createTier(userId: string, input: CreateStationPriorityTierInput) {
    const { station } = await this.requireApprovedHost(userId);
    await this.assertPriceInPlatformRange(input.priceCents);
    if (input.isActive !== false) await this.assertActiveTierCapacity(station.id);
    const last = await this.prisma.priorityTier.findFirst({
      where: { stationId: station.id, deletedAt: null },
      orderBy: { displayOrder: "desc" },
    });
    const tier = await this.prisma.priorityTier.create({
      data: {
        id: generateUuidV7(),
        stationId: station.id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        priceCents: input.priceCents,
        priorityRank: input.priorityRank,
        colorSlot: input.colorSlot,
        isActive: input.isActive ?? true,
        isUpgradeEnabled: input.isUpgradeEnabled ?? true,
        displayOrder: (last?.displayOrder ?? 0) + 1,
      },
    });
    return this.toTier(tier);
  }

  private async ownedTier(stationId: string, tierId: string) {
    const tier = await this.prisma.priorityTier.findUnique({ where: { id: tierId } });
    if (!tier || tier.deletedAt || tier.stationId !== stationId) throw new NotFoundException("Tier not found");
    return tier;
  }

  /** Edits apply to future live sessions; a session in progress keeps its snapshot. */
  async updateTier(userId: string, tierId: string, input: UpdateStationPriorityTierInput) {
    const { station } = await this.requireApprovedHost(userId);
    const tier = await this.ownedTier(station.id, tierId);
    if (input.priceCents !== undefined) await this.assertPriceInPlatformRange(input.priceCents);
    if (input.isActive === true && !tier.isActive) await this.assertActiveTierCapacity(station.id, tierId);
    const updated = await this.prisma.priorityTier.update({
      where: { id: tierId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.priorityRank !== undefined ? { priorityRank: input.priorityRank } : {}),
        ...(input.colorSlot !== undefined ? { colorSlot: input.colorSlot } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isUpgradeEnabled !== undefined ? { isUpgradeEnabled: input.isUpgradeEnabled } : {}),
        ...(input.sortOrder !== undefined ? { displayOrder: input.sortOrder } : {}),
      },
    });
    return this.toTier(updated);
  }

  /** Soft delete: past sessions and payments still reference the tier. */
  async deleteTier(userId: string, tierId: string) {
    const { station } = await this.requireApprovedHost(userId);
    await this.ownedTier(station.id, tierId);
    await this.prisma.priorityTier.update({
      where: { id: tierId },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { success: true, message: "Tier removed. It stays on past broadcasts." };
  }

  async reorderTiers(userId: string, tierIds: string[]) {
    const { station } = await this.requireApprovedHost(userId);
    const owned = await this.prisma.priorityTier.findMany({
      where: { id: { in: tierIds }, stationId: station.id, deletedAt: null },
      select: { id: true },
    });
    if (owned.length !== tierIds.length) throw new BadRequestException("Unknown tier in reorder list");
    await this.prisma.$transaction(
      tierIds.map((id, i) =>
        this.prisma.priorityTier.update({ where: { id }, data: { displayOrder: i + 1 } }),
      ),
    );
    return this.listTiers(userId);
  }
}
