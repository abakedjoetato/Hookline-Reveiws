"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HostEarningsSummary } from "@platform/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@platform/ui";
import { ArrowLeft, CalendarDays, DollarSign, ExternalLink, Loader2, Radio, Receipt } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api";
import { formatUsd } from "@/lib/money";

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(startIso: string, endIso: string | null) {
  if (!endIso) return "In progress";
  const minutes = Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function StatCard(props: { label: string; value: string; hint: string; icon: React.ReactNode }) {
  return (
    <Card className="p-5 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {props.icon}
        {props.label}
      </div>
      <p className="text-3xl font-black text-zinc-50 tabular-nums">{props.value}</p>
      <p className="text-xs text-zinc-500">{props.hint}</p>
    </Card>
  );
}

export default function HostIncomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [data, setData] = React.useState<HostEarningsSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isOpeningStripe, setIsOpeningStripe] = React.useState(false);
  const [stripeError, setStripeError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setData(await api.host.getEarnings(browserTimeZone()));
    } catch (err: any) {
      if (err?.status === 403 || err?.status === 404) {
        router.push("/host/onboarding");
        return;
      }
      setError(err?.message || "Could not load your income");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  React.useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/login?redirect=/host/income");
      return;
    }
    load();
  }, [authLoading, isAuthenticated, load, router]);

  const openStripe = async () => {
    setIsOpeningStripe(true);
    setStripeError(null);
    // Open the tab synchronously so pop-up blockers allow it, then point it at Stripe
    const tab = window.open("about:blank", "_blank");
    try {
      const { url } = await api.host.getStripeDashboardLink();
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (err: any) {
      tab?.close();
      setStripeError(err?.message || "Could not open Stripe");
    } finally {
      setIsOpeningStripe(false);
    }
  };

  if (authLoading || (isLoading && !data)) {
    return <LoadingState message="Loading your income..." />;
  }
  if (error) {
    return <ErrorState message={error} retry={load} />;
  }
  if (!data) return null;

  const currentYear = new Date().getFullYear();
  const thisYear = data.yearly.find((y) => y.year === currentYear);

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-800 pb-6">
        <div className="space-y-1">
          <Link href="/host/studio" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to studio
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-50 flex items-center gap-2.5">
            <DollarSign className="h-7 w-7 text-emerald-400" /> Income
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl">
            Your 85% share of paid submissions, after refunds. Stripe pays this out to your bank on your Stripe
            payout schedule.
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <Button onClick={openStripe} disabled={isOpeningStripe} className="gap-2 min-h-[44px]">
            {isOpeningStripe ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Open Stripe dashboard
          </Button>
          <span className="text-[11px] text-zinc-500">Balances, payouts, bank details and tax forms</span>
          {stripeError && <span className="text-xs text-red-400">{stripeError}</span>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total earned"
          value={formatUsd(data.total.netHostCents)}
          hint={
            data.total.refundedHostCents > 0
              ? `After ${formatUsd(data.total.refundedHostCents)} in refunds`
              : "All time"
          }
          icon={<DollarSign className="h-3.5 w-3.5 text-emerald-400" />}
        />
        <StatCard
          label={`${currentYear} so far`}
          value={formatUsd(thisYear?.netHostCents ?? 0)}
          hint={`${thisYear?.paidSubmissions ?? 0} paid submission${(thisYear?.paidSubmissions ?? 0) === 1 ? "" : "s"} this year`}
          icon={<CalendarDays className="h-3.5 w-3.5 text-violet-400" />}
        />
        <StatCard
          label="Paid submissions"
          value={String(data.total.paidSubmissions)}
          hint={`${formatUsd(data.total.grossCents)} paid by artists in total`}
          icon={<Receipt className="h-3.5 w-3.5 text-amber-400" />}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-zinc-100">By year</h2>
        {data.yearly.length === 0 ? (
          <EmptyState
            title="No income yet"
            description="Income appears here once artists pay for priority spots during your broadcasts."
          />
        ) : (
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Paid submissions</TableHead>
                  <TableHead className="text-right">Paid by artists</TableHead>
                  <TableHead className="text-right">Your income</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.yearly.map((y) => (
                  <TableRow key={y.year}>
                    <TableCell className="font-semibold">{y.year}</TableCell>
                    <TableCell className="text-right tabular-nums">{y.paidSubmissions}</TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-400">{formatUsd(y.grossCents)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-400">
                      {formatUsd(y.netHostCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-zinc-100">By broadcast</h2>
        {data.perLive.length === 0 ? (
          <EmptyState title="No broadcasts yet" description="Go live from your studio to start taking submissions." />
        ) : (
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Broadcast</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead className="text-right">Paid submissions</TableHead>
                  <TableHead className="text-right">Your income</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.perLive.map((l) => (
                  <TableRow key={l.liveSessionId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {l.status === "LIVE" || l.status === "PAUSED" ? (
                          <Badge variant="danger" className="gap-1 text-[10px]">
                            <Radio className="h-3 w-3" /> LIVE
                          </Badge>
                        ) : null}
                        <span className="font-medium text-zinc-100">{l.liveTitle}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-400 whitespace-nowrap">{formatDate(l.startedAt)}</TableCell>
                    <TableCell className="text-zinc-400 whitespace-nowrap">{formatDuration(l.startedAt, l.endedAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{l.paidSubmissions}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-400">
                      {formatUsd(l.netHostCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
        <p className="text-[11px] text-zinc-500">Years follow your local time zone ({data.timeZone}).</p>
      </section>
    </div>
  );
}
