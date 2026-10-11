"use client";

import * as React from "react";
import Link from "next/link";
import type { HostLiveEarnings } from "@platform/types";
import { Card } from "@platform/ui";
import { DollarSign } from "lucide-react";
import { api } from "@/lib/api";
import { formatUsd } from "@/lib/money";

const REFRESH_MS = 15_000;

/**
 * What this broadcast has earned so far (host's 85% share), shown on the
 * studio dashboard while live. Refreshes every 15 seconds.
 */
export function LiveEarningsCard({ liveSessionId }: { liveSessionId: string }) {
  const [data, setData] = React.useState<HostLiveEarnings | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await api.host.getLiveEarnings(liveSessionId);
        if (!cancelled) {
          setData(next);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [liveSessionId]);

  return (
    <Card className="p-4 flex items-center justify-between gap-4 border-emerald-900/60 bg-emerald-950/20">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
          <DollarSign className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/80">
            Earned this broadcast
          </p>
          <p className="text-2xl font-black text-zinc-50 tabular-nums" aria-live="polite">
            {data ? formatUsd(data.netHostCents) : failed ? "—" : "…"}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs text-zinc-400 tabular-nums">
          {data ? `${data.paidSubmissions} paid submission${data.paidSubmissions === 1 ? "" : "s"}` : ""}
        </p>
        <Link href="/host/income" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
          All income →
        </Link>
      </div>
    </Card>
  );
}
