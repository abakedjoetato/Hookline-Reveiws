"use client";

import * as React from "react";
import { Badge, Card } from "@platform/ui";
import { PublicQueueEntry } from "@platform/types";
import { Music, Clock, Sparkles, Disc, Radio, Volume2 } from "lucide-react";

interface PublicQueueViewProps {
  entries: PublicQueueEntry[];
  currentTrack: {
    songName: string;
    artistName: string;
    durationSeconds: number;
  } | null;
}

export const PublicQueueView: React.FC<PublicQueueViewProps> = ({
  entries,
  currentTrack,
}) => {
  const formatDuration = (seconds: number) => {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getTierColorClass = (colorSlot: string, isPriority: boolean) => {
    if (!isPriority) return "bg-zinc-800 text-zinc-300 border-zinc-700";
    switch (colorSlot) {
      case "TIER_COLOR_1":
        return "bg-violet-950/80 text-violet-300 border-violet-700/80";
      case "TIER_COLOR_2":
        return "bg-amber-950/80 text-amber-300 border-amber-700/80";
      case "TIER_COLOR_3":
        return "bg-emerald-950/80 text-emerald-300 border-emerald-700/80";
      case "TIER_COLOR_4":
        return "bg-rose-950/80 text-rose-300 border-rose-700/80";
      default:
        return "bg-violet-950/80 text-violet-300 border-violet-700/80";
    }
  };

  return (
    <div className="space-y-6">
      {/* Now Playing Banner */}
      {currentTrack && (
        <div className="p-4 sm:p-5 rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-950/40 via-zinc-900 to-zinc-900 shadow-lg shadow-violet-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
              <Volume2 className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="success" className="text-[10px] uppercase font-bold tracking-wider">
                  Live On Deck
                </Badge>
              </div>
              <h4 className="text-base sm:text-lg font-bold text-zinc-50 mt-0.5 truncate">
                {currentTrack.songName}
              </h4>
              <p className="text-xs sm:text-sm font-medium text-violet-300">
                {currentTrack.artistName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center text-xs font-mono text-zinc-400 bg-zinc-950/60 px-3 py-1.5 rounded-md border border-zinc-800">
            <Clock className="h-3.5 w-3.5" />
            <span>{formatDuration(currentTrack.durationSeconds)}</span>
          </div>
        </div>
      )}

      {/* Up Next / Live Queue List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Radio className="h-4 w-4 text-violet-400" />
            Authoritative Live Queue ({entries.length})
          </h3>
          <span className="text-xs text-zinc-500">
            Priority sorted & live synchronized
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl p-6 space-y-2">
            <Music className="h-8 w-8 text-zinc-600 mx-auto" />
            <p className="text-sm font-medium text-zinc-300">Queue is currently empty</p>
            <p className="text-xs text-zinc-500">
              Be the first to submit a track to this live station!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, index) => {
              const isPlaying = entry.status === "PLAYING";
              const isNext = entry.status === "NEXT";

              return (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between p-3.5 sm:p-4 rounded-lg border transition-all ${
                    isPlaying
                      ? "border-violet-500 bg-violet-950/20"
                      : isNext
                        ? "border-amber-500/50 bg-amber-950/10"
                        : "border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-900/70"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Position Number */}
                    <div className="h-7 w-7 rounded-md bg-zinc-800/80 text-zinc-300 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      #{index + 1}
                    </div>

                    {/* Track Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-zinc-100 truncate">
                          {entry.songName}
                        </span>

                        {/* Priority Rank & Tier Badge */}
                        {entry.isPriority ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded border ${getTierColorClass(
                              entry.colorSlot,
                              true,
                            )}`}
                          >
                            <Sparkles className="h-3 w-3" />
                            {entry.tierName || "Priority"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                            Free Line
                          </span>
                        )}

                        {isPlaying && <Badge variant="success">Playing</Badge>}
                        {isNext && <Badge variant="warning">Up Next</Badge>}
                      </div>

                      <p className="text-xs text-zinc-400 mt-0.5 truncate">
                        {entry.artistName}
                      </p>
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="text-xs font-mono text-zinc-400 shrink-0 ml-3">
                    {formatDuration(entry.durationSeconds)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
