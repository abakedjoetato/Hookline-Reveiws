"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, Badge, Card } from "@platform/ui";
import {
  PublicLiveSessionDetail,
  PublicQueueEntry,
} from "@platform/types";
import {
  Radio,
  ExternalLink,
  Send,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Loader2,
  Wifi,
  WifiOff,
  User,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { useLiveSocket } from "../../../hooks/useLiveSocket";
import { PublicQueueView } from "../../../components/PublicQueueView";
import { SubmissionModal } from "../../../components/SubmissionModal";

export default function PublicSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.id as string;

  const [session, setSession] = React.useState<PublicLiveSessionDetail | null>(
    null,
  );
  const [queueEntries, setQueueEntries] = React.useState<PublicQueueEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmissionModalOpen, setIsSubmissionModalOpen] =
    React.useState(false);

  // Authoritative data fetch
  const fetchSessionData = async (silent = false) => {
    if (!sessionId) return;
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const [sessionData, queueData] = await Promise.all([
        api.liveSessions.getPublicById(sessionId),
        api.liveSessions.getPublicQueue(sessionId),
      ]);
      setSession(sessionData);
      setQueueEntries(queueData);
    } catch (err: any) {
      setError(err?.message || "Failed to load live session details");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Socket connection to session:PUBLIC:${sessionId}
  const { isConnected, socketError } = useLiveSocket(sessionId, {
    onReconcile: () => {
      fetchSessionData(true);
    },
  });

  React.useEffect(() => {
    fetchSessionData();
  }, [sessionId]);

  const getPlatformLabel = (platform: string) => {
    switch (platform) {
      case "TWITCH":
        return "Twitch";
      case "YOUTUBE":
        return "YouTube";
      case "TIKTOK":
        return "TikTok";
      case "KICK":
        return "Kick";
      default:
        return platform;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
        <p className="text-sm text-zinc-400">Connecting to live station...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="text-center py-16 space-y-4 max-w-md mx-auto">
        <div className="h-14 w-14 rounded-full bg-red-950/50 border border-red-800 text-red-400 flex items-center justify-center mx-auto">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100">
          Session Not Available
        </h2>
        <p className="text-sm text-zinc-400">
          {error || "The requested live session could not be found or has ended."}
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Link href="/hosts">
            <Button variant="primary" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Browse Active Stations
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSessionData()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Navigation / Breadcrumbs */}
      <div className="flex items-center justify-between">
        <Link
          href="/hosts"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Stations
        </Link>

        {/* Real-time Socket Indicator */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge variant="success" className="gap-1 text-[11px]">
              <Wifi className="h-3 w-3" /> Live Synced
            </Badge>
          ) : (
            <Badge variant="warning" className="gap-1 text-[11px]">
              <WifiOff className="h-3 w-3" /> Reconnecting
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchSessionData(true)}
            disabled={isRefreshing}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw
              className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Main Station Banner */}
      <Card className="border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Badge
                variant={session.status === "LIVE" ? "success" : "warning"}
                className="gap-1.5"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                {session.status === "LIVE" ? "STREAM LIVE" : "SESSION PAUSED"}
              </Badge>

              <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                {getPlatformLabel(session.primaryStreamingPlatform)}
              </span>

              {session.submissionsOpen ? (
                <Badge variant="info" className="gap-1">
                  <Send className="h-3 w-3" /> Submissions Open
                </Badge>
              ) : (
                <Badge variant="secondary">Submissions Closed</Badge>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-zinc-50 tracking-tight">
              {session.stationName}
            </h1>
            <p className="text-sm sm:text-base text-violet-400 font-medium">
              Host: {session.hostName}
            </p>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl">
              {session.liveTitle}
            </p>
            {session.hostBio && (
              <p className="text-xs text-zinc-500 italic pt-1 border-t border-zinc-800/80">
                "{session.hostBio}"
              </p>
            )}
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {session.streamUrl && (
              <a
                href={session.streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-colors"
              >
                <ExternalLink className="h-4 w-4" /> Watch Broadcast
              </a>
            )}

            <Button
              variant="primary"
              size="lg"
              disabled={!session.submissionsOpen}
              onClick={() => setIsSubmissionModalOpen(true)}
              className="gap-2 shadow-lg shadow-violet-900/30"
            >
              <Send className="h-4 w-4" />
              {session.submissionsOpen ? "Submit Music to Queue" : "Submissions Closed"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Live Queue & Now Playing Section */}
      <PublicQueueView
        entries={queueEntries}
        currentTrack={session.currentTrack}
      />

      {/* Submission Modal */}
      <SubmissionModal
        isOpen={isSubmissionModalOpen}
        onClose={() => setIsSubmissionModalOpen(false)}
        sessionId={session.id}
        sessionTitle={session.stationName}
        onSubmissionSuccess={() => {
          fetchSessionData(true);
        }}
      />
    </div>
  );
}
