"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { PublicQueueEntry, PublicLiveSessionDetail } from "@platform/types";
import { Button, Card, Badge } from "@platform/ui";
import {
  Play,
  CheckCircle,
  SkipForward,
  Music,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sliders,
  Volume2,
  AlertCircle,
} from "lucide-react";

interface HostQueueManagerProps {
  sessionId: string;
  onSessionUpdated?: () => void;
}

export function HostQueueManager({
  sessionId,
  onSessionUpdated,
}: HostQueueManagerProps) {
  const [session, setSession] = React.useState<PublicLiveSessionDetail | null>(null);
  const [queue, setQueue] = React.useState<PublicQueueEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadQueueData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const [sessData, queueData] = await Promise.all([
        api.liveSessions.getPublicById(sessionId),
        api.liveSessions.getPublicQueue(sessionId),
      ]);
      setSession(sessData);
      setQueue(queueData || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load live session queue");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadQueueData();
    const interval = setInterval(() => {
      loadQueueData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const handlePlay = async (entryId: string) => {
    setActionId(entryId);
    setError(null);
    try {
      await api.liveSessions.loadQueueEntry(
        sessionId,
        entryId,
        session?.queueRevision || 1,
      );
      await loadQueueData(true);
      if (onSessionUpdated) onSessionUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to play track");
    } finally {
      setActionId(null);
    }
  };

  const handleComplete = async (entryId: string) => {
    setActionId(entryId);
    setError(null);
    try {
      await api.liveSessions.clearPlayer(
        sessionId,
        session?.queueRevision || 1,
      );
      await loadQueueData(true);
      if (onSessionUpdated) onSessionUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to mark track as completed");
    } finally {
      setActionId(null);
    }
  };

  const handleSkip = async (entryId: string) => {
    setActionId(entryId);
    setError(null);
    try {
      await api.liveSessions.playNext(
        sessionId,
        session?.queueRevision || 1,
      );
      await loadQueueData(true);
      if (onSessionUpdated) onSessionUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to skip track");
    } finally {
      setActionId(null);
    }
  };

  const handleToggleSubmissions = async () => {
    if (!session) return;
    setIsUpdating(true);
    setError(null);
    try {
      await api.liveSessions.updateConfiguration(sessionId, {
        submissionsOpen: !session.submissionsOpen,
      });
      await loadQueueData(true);
      if (onSessionUpdated) onSessionUpdated();
    } catch (err: any) {
      setError(err?.message || "Failed to update submissions toggle");
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-zinc-800 p-8 text-center space-y-3 bg-zinc-900/40">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400 mx-auto" />
        <p className="text-xs text-zinc-400">Loading live broadcast queue...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-red-200 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Queue Quick Controls Bar */}
      <Card className="border-zinc-800 bg-zinc-900/80 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Badge
            variant={session?.submissionsOpen ? "success" : "warning"}
            className="text-xs font-bold"
          >
            {session?.submissionsOpen ? "Submissions Open" : "Submissions Paused"}
          </Badge>
          <span className="text-xs text-zinc-400">
            Total waiting: <strong className="text-zinc-200">{queue.length}</strong> tracks
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleToggleSubmissions}
            disabled={isUpdating}
            className="text-xs"
          >
            {session?.submissionsOpen ? "Pause Submissions" : "Resume Submissions"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => loadQueueData(true)}
            className="h-8 px-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>

      {/* Now Playing Banner (if active) */}
      {session?.currentTrack && (
        <Card className="border-violet-500/40 bg-gradient-to-r from-violet-950/50 via-zinc-900 to-zinc-950 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-violet-600/30 text-violet-300 flex items-center justify-center animate-pulse">
                <Volume2 className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                  Now Reviewing On Stream
                </span>
                <h4 className="text-sm font-bold text-zinc-100">
                  {session.currentTrack.songName}
                </h4>
                <p className="text-xs text-zinc-400">
                  By {session.currentTrack.artistName} • Submitted by{" "}
                  <span className="text-zinc-300 font-medium">
                    {session.currentTrack.submitterName}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {session.currentTrack.audioUrl && (
                <a
                  href={session.currentTrack.audioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1"
                >
                  <Music className="h-3.5 w-3.5 text-violet-400" /> Audio Stream
                </a>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Live Queue Items */}
      {queue.length === 0 ? (
        <Card className="border-dashed border-zinc-800 p-8 text-center space-y-2 bg-zinc-900/20">
          <Music className="h-6 w-6 text-zinc-600 mx-auto" />
          <p className="text-xs font-semibold text-zinc-300">
            Queue is currently empty
          </p>
          <p className="text-[11px] text-zinc-500">
            Share your station vanity link with viewers so artists can submit their tracks.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {queue.map((entry, index) => (
            <Card
              key={entry.id}
              className={`border-zinc-800 bg-zinc-900/50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-700 transition-colors ${
                entry.isPriority ? "border-amber-800/40 bg-amber-950/10" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-mono font-bold text-zinc-400 shrink-0">
                  #{index + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-zinc-100 truncate">
                      {entry.songName}
                    </span>
                    {entry.isPriority && (
                      <Badge variant="warning" className="text-[9px] font-bold">
                        {entry.tierName || "Priority"} (Priority #{entry.priorityRank})
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 truncate">
                    Artist: {entry.artistName}
                  </p>
                </div>
              </div>

              {/* Host Actions on Track */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={actionId === entry.id}
                  onClick={() => handlePlay(entry.id)}
                  className="gap-1 text-xs"
                >
                  <Play className="h-3 w-3 fill-current" /> Play / Review
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={actionId === entry.id}
                  onClick={() => handleComplete(entry.id)}
                  className="gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                >
                  <CheckCircle className="h-3 w-3" /> Done
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={actionId === entry.id}
                  onClick={() => handleSkip(entry.id)}
                  className="gap-1 text-xs text-zinc-400 hover:text-red-400"
                >
                  <SkipForward className="h-3 w-3" /> Skip
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
