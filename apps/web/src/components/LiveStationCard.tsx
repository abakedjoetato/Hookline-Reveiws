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

  return (
    <Card className="flex flex-col justify-between border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 transition-all">
      <div className="space-y-4">
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge
            variant={session.status === "LIVE" ? "success" : "warning"}
            className="flex items-center gap-1.5"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {session.status === "LIVE" ? "STREAM LIVE" : "PAUSED"}
          </Badge>

          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
            {getPlatformLabel(session.primaryStreamingPlatform)}
          </span>
        </div>

        {/* Station Info */}
        <div>
          <h3 className="text-lg font-bold text-zinc-100 group-hover:text-violet-400 transition-colors">
            {session.stationName}
          </h3>
          <p className="text-sm font-medium text-violet-400">
            Hosted by {session.hostName}
          </p>
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
            {session.liveTitle}
          </p>
        </div>

        {/* Submissions Flags */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {session.submissionsOpen ? (
            <Badge variant="info" className="gap-1">
              <Send className="h-3 w-3" /> Submissions Open
            </Badge>
          ) : (
            <Badge variant="secondary">Submissions Closed</Badge>
          )}

          {session.paidSubmissionsOpen && (
            <Badge variant="info" className="gap-1">
              <Sparkles className="h-3 w-3" /> Priority Active
            </Badge>
          )}

          {session.freeLineOpen && (
            <span className="text-[11px] text-zinc-400">Free Line Available</span>
          )}
        </div>
      </div>

      {/* Card Actions */}
      <div className="pt-6 flex items-center gap-3">
        <Link href={`/session/${session.id}`} className="flex-1">
          <Button variant="primary" size="sm" className="w-full gap-1.5">
            <Radio className="h-4 w-4" /> Enter Live Session
          </Button>
        </Link>
        {session.streamUrl && (
          <a
            href={session.streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-md border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
            title="Open Stream Channel"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </Card>
  );
};
