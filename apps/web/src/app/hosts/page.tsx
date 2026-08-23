"use client";

import * as React from "react";
import { Button, Badge } from "@platform/ui";
import { Radio, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { PublicLiveSessionSummary } from "@platform/types";
import { api } from "../../lib/api";
import { LiveStationCard } from "../../components/LiveStationCard";

export default function LiveStationsPage() {
  const [sessions, setSessions] = React.useState<PublicLiveSessionSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchStations = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      const data = await api.liveSessions.getPublic();
      setSessions(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load live sessions directory");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  React.useEffect(() => {
    fetchStations();
    // Poll active stations every 30 seconds
    const interval = setInterval(() => {
      fetchStations(true);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-50 flex items-center gap-3">
              <Radio className="h-7 w-7 text-violet-500 animate-pulse" />
              Live Host Stations
            </h1>
            <Badge variant="success" className="text-xs">
              {sessions.length} Live
            </Badge>
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            Discover active streams, review live queues, and submit music directly to broadcasters
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchStations(true)}
          disabled={isLoading || isRefreshing}
          className="gap-2 self-start sm:self-auto"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh Directory
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-300 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Directory Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          <p className="text-sm text-zinc-400">Discovering active live stations...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-zinc-800 rounded-xl p-8 space-y-4">
          <div className="h-16 w-16 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
            <Radio className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-zinc-200">
              No Hosts Broadcasting Right Now
            </h3>
            <p className="text-sm text-zinc-400 max-w-md mx-auto">
              There are currently no live sessions accepting submissions. Check back soon or follow your favorite hosts on Twitch and YouTube.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => fetchStations(true)}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Check Again
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map((session) => (
            <LiveStationCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
