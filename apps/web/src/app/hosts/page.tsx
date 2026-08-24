"use client";

import * as React from "react";
import { Button, Badge, Input } from "@platform/ui";
import { Radio, RefreshCw, AlertCircle, Loader2, Search, Filter } from "lucide-react";
import { PublicLiveSessionSummary } from "@platform/types";
import { api } from "../../lib/api";
import { LiveStationCard } from "../../components/LiveStationCard";

export default function LiveStationsPage() {
  const [sessions, setSessions] = React.useState<PublicLiveSessionSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedPlatform, setSelectedPlatform] = React.useState<string>("ALL");

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

  const filteredSessions = React.useMemo(() => {
    return sessions.filter((s) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        s.stationName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.hostName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.liveTitle?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPlatform =
        selectedPlatform === "ALL" ||
        s.primaryStreamingPlatform === selectedPlatform;

      return matchesSearch && matchesPlatform;
    });
  }, [sessions, searchQuery, selectedPlatform]);

  const platforms = [
    { id: "ALL", label: "All Platforms" },
    { id: "TWITCH", label: "Twitch" },
    { id: "YOUTUBE", label: "YouTube" },
    { id: "KICK", label: "Kick" },
    { id: "TIKTOK", label: "TikTok" },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-50 flex items-center gap-2.5">
              <Radio className="h-6 w-6 sm:h-7 sm:text-violet-400 text-violet-500 animate-pulse" />
              Live Host Stations
            </h1>
            <Badge variant="success" className="text-xs">
              {sessions.length} Broadcasting
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Discover broadcaster stations, view queue lengths, and submit music directly to streamers
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchStations(true)}
          disabled={isLoading || isRefreshing}
          className="gap-2 self-start sm:self-auto min-h-[44px]"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh Directory
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-900/40">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search stations, hosts, genres..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-md bg-zinc-950 border border-zinc-700/80 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
          />
        </div>

        {/* Platform Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {platforms.map((p) => {
            const isSelected = selectedPlatform === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlatform(p.id)}
                className={`px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-colors min-h-[38px] cursor-pointer ${
                  isSelected
                    ? "bg-violet-600 text-white"
                    : "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
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
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl p-6 sm:p-8 space-y-4">
          <div className="h-14 w-14 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
            <Radio className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-zinc-200">
              {sessions.length === 0
                ? "No Broadcasters Live Right Now"
                : "No Stations Match Your Filter"}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
              {sessions.length === 0
                ? "Check back soon or follow your favorite hosts. Stations appear here automatically when broadcasters go live."
                : "Try resetting your search query or choosing All Platforms."}
            </p>
          </div>
          {sessions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedPlatform("ALL");
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredSessions.map((session) => (
            <LiveStationCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
