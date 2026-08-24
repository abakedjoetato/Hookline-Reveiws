"use client";

import * as React from "react";
import { Card, Badge, Button } from "@platform/ui";
import { Radio, Users, ExternalLink, Music, Send, Sparkles } from "lucide-react";
import { PublicLiveSessionSummary } from "@platform/types";
import Link from "next/link";

interface LiveStationCardProps {
  session: PublicLiveSessionSummary;
}

export const LiveStationCard: React.FC<LiveStationCardProps> = ({ session }) => {
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

  const isLive = session.status === "LIVE";

  return (
    <Card className="flex flex-col justify-between border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 transition-all p-4 sm:p-6 space-y-4">
      <div className="space-y-3">
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge
            variant={isLive ? "success" : "warning"}
            className="flex items-center gap-1.5"
          >
            <span className="relative flex h-2 w-2">
              {isLive && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isLive ? "bg-emerald-500" : "bg-amber-500"
                }`}
              ></span>
            </span>
            {isLive ? "STREAM LIVE" : "PAUSED"}
          </Badge>

          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
            {getPlatformLabel(session.primaryStreamingPlatform)}
          </span>
        </div>

        {/* Station Info */}
        <div>
          <h3 className="text-base sm:text-lg font-bold text-zinc-100 line-clamp-1">
            {session.stationName}
          </h3>
          <p className="text-xs sm:text-sm font-medium text-violet-400">
            Hosted by {session.hostName}
          </p>
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
            {session.liveTitle || "Live track review and feedback session"}
          </p>
        </div>

        {/* Submissions Flags */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs pt-1">
          {session.submissionsOpen ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
              <Send className="h-3 w-3" /> Submissions Open
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[11px] font-semibold">
              Submissions Closed
            </span>
          )}

          {session.paidSubmissionsOpen && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px] font-semibold">
              <Sparkles className="h-3 w-3" /> Priority Available
            </span>
          )}

          {session.freeLineOpen && (
            <span className="text-[11px] text-zinc-400 ml-1">Free Line Open</span>
          )}
        </div>
      </div>

      {/* Card Actions */}
      <div className="pt-4 border-t border-zinc-800/80 flex items-center gap-2.5">
        <Link href={`/session/${session.id}`} className="flex-1">
          <Button variant="primary" size="sm" className="w-full gap-1.5 min-h-[44px]">
            <Radio className="h-4 w-4" /> Enter Live Session
          </Button>
        </Link>
        {session.streamUrl && (
          <a
            href={session.streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open broadcast stream in new tab"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
            title="Watch Broadcast"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </Card>
  );
};
