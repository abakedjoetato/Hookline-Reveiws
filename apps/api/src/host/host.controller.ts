import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createHostApplicationSchema,
  createStationPriorityTierSchema,
  goLiveSchema,
  reorderStationPriorityTiersSchema,
  updateStationPriorityTierSchema,
  updateStationSchema,
  CreateHostApplicationInput,
  CreateStationPriorityTierInput,
  GoLiveInput,
  ReorderStationPriorityTiersInput,
  UpdateStationInput,
  UpdateStationPriorityTierInput,
} from "@platform/validation";
import { SessionGuard } from "../auth/guards/session.guard";
import { RequestWithUser } from "../auth/interfaces/request-with-user.interface";
import { ZodBody } from "../common/zod-validation.pipe";
import { clientIp, userAgent } from "../common/request-meta";
import { LiveSessionsService } from "../live-sessions/live-sessions.service";
import { HostService } from "./host.service";
import { HostEarningsService } from "./host-earnings.service";

/** Host onboarding, station management and income: /api/v1/host/... */
@Controller("host")
@UseGuards(SessionGuard)
export class HostController {
  constructor(
    private readonly host: HostService,
    private readonly earnings: HostEarningsService,
    private readonly liveSessions: LiveSessionsService,
  ) {}

  // ---- Onboarding ---------------------------------------------------------

  @Get("onboarding-status")
  onboardingStatus(@Req() req: RequestWithUser) {
    return this.host.onboardingStatus(req.user.id);
  }

  @Post("apply")
  apply(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(createHostApplicationSchema)) body: CreateHostApplicationInput,
  ) {
    return this.host.apply(req.user, body, { ipAddress: clientIp(req), userAgent: userAgent(req) });
  }

  @Post("stripe/connect")
  stripeConnect(@Req() req: RequestWithUser) {
    return this.host.createStripeConnectLink(req.user);
  }

  @Get("stripe/status")
  stripeStatus(@Req() req: RequestWithUser) {
    return this.host.getStripeStatus(req.user.id);
  }

  /** Re-checks the account with Stripe (after returning from onboarding). */
  @Post("stripe/status")
  stripeSync(@Req() req: RequestWithUser) {
    return this.host.syncStripeStatus(req.user.id);
  }

  @Post("stripe/dashboard-link")
  stripeDashboard(@Req() req: RequestWithUser) {
    return this.host.stripeDashboardLink(req.user.id);
  }

  // ---- Station ------------------------------------------------------------

  @Get("station")
  station(@Req() req: RequestWithUser) {
    return this.host.getStation(req.user.id);
  }

  @Patch("station")
  updateStation(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(updateStationSchema)) body: UpdateStationInput,
  ) {
    return this.host.updateStation(req.user.id, body);
  }

  @Get("station/weekly-top3")
  async weeklyTop3(@Req() req: RequestWithUser, @Query("date") date?: string) {
    const { station } = await this.host.requireApprovedHost(req.user.id);
    return this.liveSessions.getWeeklyTop3(station.id, date ? new Date(date) : undefined);
  }

  @Post("go-live")
  goLive(@Req() req: RequestWithUser, @Body(new ZodBody(goLiveSchema)) body: GoLiveInput) {
    return this.host.goLive(req.user, body, { ipAddress: clientIp(req), userAgent: userAgent(req) });
  }

  @Post("go-offline")
  goOffline(@Req() req: RequestWithUser) {
    return this.host.goOffline(req.user.id);
  }

  // ---- Priority tiers -----------------------------------------------------

  @Get("station/tiers")
  tiers(@Req() req: RequestWithUser) {
    return this.host.listTiers(req.user.id);
  }

  @Post("station/tiers")
  createTier(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(createStationPriorityTierSchema)) body: CreateStationPriorityTierInput,
  ) {
    return this.host.createTier(req.user.id, body);
  }

  @Post("station/tiers/reorder")
  reorderTiers(
    @Req() req: RequestWithUser,
    @Body(new ZodBody(reorderStationPriorityTiersSchema)) body: ReorderStationPriorityTiersInput,
  ) {
    return this.host.reorderTiers(req.user.id, body.tierIds);
  }

  @Patch("station/tiers/:tierId")
  updateTier(
    @Req() req: RequestWithUser,
    @Param("tierId", ParseUUIDPipe) tierId: string,
    @Body(new ZodBody(updateStationPriorityTierSchema)) body: UpdateStationPriorityTierInput,
  ) {
    return this.host.updateTier(req.user.id, tierId, body);
  }

  @Delete("station/tiers/:tierId")
  deleteTier(@Req() req: RequestWithUser, @Param("tierId", ParseUUIDPipe) tierId: string) {
    return this.host.deleteTier(req.user.id, tierId);
  }

  // ---- Income -------------------------------------------------------------

  /** Totals, per-year and per-broadcast income. `tz` sets year boundaries. */
  @Get("earnings")
  async earningsSummary(@Req() req: RequestWithUser, @Query("tz") tz?: string) {
    const { hostProfile } = await this.host.requireApprovedHost(req.user.id);
    return this.earnings.summary(hostProfile.id, tz || undefined);
  }

  /** Income for one broadcast (the live dashboard polls this). */
  @Get("earnings/live/:liveSessionId")
  async liveEarnings(
    @Req() req: RequestWithUser,
    @Param("liveSessionId", ParseUUIDPipe) liveSessionId: string,
  ) {
    const { hostProfile } = await this.host.requireApprovedHost(req.user.id);
    return this.earnings.forLive(hostProfile.id, liveSessionId);
  }
}
