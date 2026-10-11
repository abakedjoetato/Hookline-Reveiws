import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaClient } from "@platform/database";
import type {
  HostEarningsLiveRow,
  HostEarningsSummary,
  HostEarningsYearRow,
  HostLiveEarnings,
} from "@platform/types";

/** Earnings rows that still belong to the host (not reversed by Stripe). */
const COUNTED_STATUSES = ["ALLOCATED_TO_STRIPE", "DISPUTED", "REFUNDED"] as const;

function assertTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    throw new BadRequestException("Unknown time zone");
  }
}

function yearIn(date: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(date));
}

/**
 * Host income, read from HostEarning (one row per paid submission, written when
 * Stripe confirms the payment). Amounts are the host's 85% share in USD cents,
 * net of refunds (refunded host share is subtracted).
 */
@Injectable()
export class HostEarningsService {
  constructor(private readonly prisma: PrismaClient) {}

  private async rows(hostProfileId: string, where: Record<string, unknown> = {}) {
    const earnings = await this.prisma.hostEarning.findMany({
      where: { hostId: hostProfileId, status: { in: [...COUNTED_STATUSES] }, ...where },
      include: {
        payment: {
          select: {
            refunds: { where: { status: "SUCCEEDED" }, select: { hostReversalAmountCents: true } },
          },
        },
      },
      orderBy: { allocatedAt: "asc" },
    });
    return earnings.map((e) => {
      const refundedHostCents = e.payment.refunds.reduce((sum, r) => sum + r.hostReversalAmountCents, 0);
      return {
        liveSessionId: e.liveSessionId,
        allocatedAt: e.allocatedAt,
        grossCents: e.grossAmountCents,
        hostShareCents: e.hostShareCents,
        refundedHostCents,
        netHostCents: Math.max(0, e.hostShareCents - refundedHostCents),
      };
    });
  }

  async summary(hostProfileId: string, timeZone = "America/New_York"): Promise<HostEarningsSummary> {
    const tz = assertTimeZone(timeZone);
    const rows = await this.rows(hostProfileId);

    const total = rows.reduce(
      (acc, r) => ({
        grossCents: acc.grossCents + r.grossCents,
        netHostCents: acc.netHostCents + r.netHostCents,
        refundedHostCents: acc.refundedHostCents + r.refundedHostCents,
        paidSubmissions: acc.paidSubmissions + 1,
      }),
      { grossCents: 0, netHostCents: 0, refundedHostCents: 0, paidSubmissions: 0 },
    );

    const byYear = new Map<number, HostEarningsYearRow>();
    for (const r of rows) {
      const year = yearIn(r.allocatedAt, tz);
      const y = byYear.get(year) ?? { year, grossCents: 0, netHostCents: 0, paidSubmissions: 0 };
      y.grossCents += r.grossCents;
      y.netHostCents += r.netHostCents;
      y.paidSubmissions += 1;
      byYear.set(year, y);
    }

    const byLive = new Map<string, { grossCents: number; netHostCents: number; paidSubmissions: number }>();
    for (const r of rows) {
      if (!r.liveSessionId) continue;
      const l = byLive.get(r.liveSessionId) ?? { grossCents: 0, netHostCents: 0, paidSubmissions: 0 };
      l.grossCents += r.grossCents;
      l.netHostCents += r.netHostCents;
      l.paidSubmissions += 1;
      byLive.set(r.liveSessionId, l);
    }

    // Every broadcast is listed, including ones that earned nothing
    const host = await this.prisma.hostProfile.findUniqueOrThrow({
      where: { id: hostProfileId },
      select: { userId: true },
    });
    const sessions = await this.prisma.liveSession.findMany({
      where: { hostId: host.userId, startedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { id: true, liveTitle: true, status: true, startedAt: true, endedAt: true, station: { select: { stationName: true } } },
    });
    const perLive: HostEarningsLiveRow[] = sessions.map((s) => {
      const l = byLive.get(s.id) ?? { grossCents: 0, netHostCents: 0, paidSubmissions: 0 };
      return {
        liveSessionId: s.id,
        liveTitle: s.liveTitle,
        stationName: s.station.stationName,
        status: s.status as HostEarningsLiveRow["status"],
        startedAt: s.startedAt!.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        ...l,
      };
    });

    return {
      currency: "USD",
      timeZone: tz,
      total,
      yearly: [...byYear.values()].sort((a, b) => b.year - a.year),
      perLive,
    };
  }

  /** Earnings for one broadcast (used by the live dashboard). */
  async forLive(hostProfileId: string, liveSessionId: string): Promise<HostLiveEarnings> {
    const rows = await this.rows(hostProfileId, { liveSessionId });
    return {
      liveSessionId,
      currency: "USD",
      grossCents: rows.reduce((s, r) => s + r.grossCents, 0),
      netHostCents: rows.reduce((s, r) => s + r.netHostCents, 0),
      paidSubmissions: rows.length,
    };
  }
}
