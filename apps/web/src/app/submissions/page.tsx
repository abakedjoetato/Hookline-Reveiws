"use client";

import * as React from "react";
import { Button, Badge, Card } from "@platform/ui";
import {
  UserSubmissionSummary,
} from "@platform/types";
import {
  Send,
  Music,
  Clock,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Loader2,
  Radio,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { api } from "../../lib/api";
import { UpgradeModal } from "../../components/UpgradeModal";

export default function UserSubmissionsPage() {
  const [submissions, setSubmissions] = React.useState<
    UserSubmissionSummary[]
  >([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedSubmissionForUpgrade, setSelectedSubmissionForUpgrade] =
    React.useState<UserSubmissionSummary | null>(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = React.useState(false);

  const fetchSubmissions = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const data = await api.submissions.getMine();
      setSubmissions(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load submission history");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  React.useEffect(() => {
    fetchSubmissions();
  }, []);

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PLAYING":
        return <Badge variant="success">Currently Playing</Badge>;
      case "NEXT":
        return <Badge variant="warning">Up Next</Badge>;
      case "QUEUED":
        return <Badge variant="info">In Live Queue</Badge>;
      case "PLAYED":
        return <Badge variant="secondary">Reviewed / Played</Badge>;
      case "DISQUALIFIED":
        return <Badge variant="danger">Disqualified</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleOpenUpgrade = (sub: UserSubmissionSummary) => {
    setSelectedSubmissionForUpgrade(sub);
    setIsUpgradeModalOpen(true);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-50 flex items-center gap-3">
            <Send className="h-7 w-7 text-violet-500" />
            My Submissions
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Track your song review status, queue positions, and priority upgrades across all stations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSubmissions(true)}
            disabled={isLoading || isRefreshing}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Link href="/hosts">
            <Button variant="primary" size="sm" className="gap-2">
              <Radio className="h-4 w-4" />
              Find Live Stations
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-300 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Submissions List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          <p className="text-sm text-zinc-400">Loading your submissions...</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl p-8 space-y-4">
          <div className="h-14 w-14 rounded-full bg-zinc-900 text-zinc-500 flex items-center justify-center mx-auto">
            <Send className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-zinc-100">
              No Submissions Yet
            </h3>
            <p className="text-sm text-zinc-400 max-w-sm mx-auto">
              You haven't submitted any tracks to live sessions yet. Check out currently broadcasting hosts and join their queues!
            </p>
          </div>
          <Link href="/hosts">
            <Button variant="primary" className="gap-2">
              <Radio className="h-4 w-4" /> Browse Live Stations
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold px-2">
            <span>{submissions.length} Total Submissions</span>
            <span>Live Status & Actions</span>
          </div>

          <div className="space-y-3">
            {submissions.map((sub) => {
              const isQueued = sub.currentQueueStatus === "QUEUED";
              const canUpgrade = isQueued && sub.sessionStatus !== "ENDED";

              return (
                <Card
                  key={sub.id}
                  className="border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-zinc-700 transition-all"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                    <div className="p-3 bg-violet-600/10 text-violet-400 rounded-lg shrink-0 mt-0.5 sm:mt-0">
                      <Music className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm sm:text-base text-zinc-100 truncate">
                          {sub.songName}
                        </h4>

                        {sub.isPriority ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded bg-violet-950/80 text-violet-300 border border-violet-700/80">
                            <Sparkles className="h-3 w-3" />
                            {sub.tierName || "Priority"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                            Free Line
                          </span>
                        )}

                        {getStatusBadge(sub.currentQueueStatus)}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1 flex-wrap">
                        <span className="text-zinc-300 font-medium">
                          {sub.artistName}
                        </span>
                        <span>•</span>
                        <Link
                          href={`/session/${sub.liveSessionId}`}
                          className="text-violet-400 hover:text-violet-300 font-medium flex items-center gap-1"
                        >
                          {sub.stationName} ({sub.sessionTitle})
                        </Link>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-zinc-500">
                          <Clock className="h-3 w-3" />
                          {formatDuration(sub.durationSeconds)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Links */}
                  <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800">
                    {canUpgrade && !sub.isPriority && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleOpenUpgrade(sub)}
                        className="gap-1.5 text-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Upgrade to Priority
                      </Button>
                    )}

                    <Link href={`/session/${sub.liveSessionId}`}>
                      <Button variant="outline" size="sm" className="gap-1 text-xs">
                        View Session <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        submission={selectedSubmissionForUpgrade}
        onUpgradeSuccess={() => {
          fetchSubmissions(true);
        }}
      />
    </div>
  );
}
