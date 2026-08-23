"use client";

import * as React from "react";
import { Card, Button, Badge } from "@platform/ui";
import { Music, Radio, Send, Play, Users, Disc, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import { api } from "../lib/api";
import { PublicLiveSessionSummary } from "@platform/types";
import { LiveStationCard } from "../components/LiveStationCard";

export default function HomePage() {
  const [liveSessions, setLiveSessions] = React.useState<PublicLiveSessionSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchLive = async () => {
      try {
        const data = await api.liveSessions.getPublic();
        setLiveSessions(data);
      } catch (err) {
        console.error("Failed to load live sessions", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLive();
  }, []);

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-10 md:py-16 max-w-3xl mx-auto space-y-6">
        <Badge variant="info" className="px-3 py-1 text-xs">
          TheQueue • Live Music Submission Engine
        </Badge>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-indigo-200 to-zinc-50 bg-clip-text text-transparent">
          Connect Your Music Directly to Live Streams
        </h1>
        <p className="text-base sm:text-lg text-zinc-400 max-w-xl mx-auto leading-relaxed">
          Upload your tracks once, submit to approved live stream hosts, unlock priority tiers, and follow your song review live on air.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <Link href="/library" className="w-full sm:w-auto">
            <Button
              variant="primary"
              size="lg"
              className="w-full sm:w-auto shadow-lg shadow-violet-500/20 gap-2"
            >
              <Music className="h-4 w-4" /> Manage Music Library
            </Button>
          </Link>
          <Link href="/hosts" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2">
              <Radio className="h-4 w-4" /> Browse Live Stations ({liveSessions.length})
            </Button>
          </Link>
        </div>
      </section>

      {/* Live Now Section */}
      {liveSessions.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-100">
                Broadcasting Right Now
              </h2>
            </div>
            <Link
              href="/hosts"
              className="text-xs sm:text-sm font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveSessions.slice(0, 3).map((session) => (
              <LiveStationCard key={session.id} session={session} />
            ))}
          </div>
        </section>
      )}

      {/* Feature Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="flex flex-col justify-between border-zinc-800 bg-zinc-900/50">
          <div className="space-y-4">
            <div className="h-10 w-10 rounded-md bg-violet-600/10 flex items-center justify-center text-violet-400">
              <Disc
                className="h-5 w-5 animate-spin"
                style={{ animationDuration: "6s" }}
              />
            </div>
            <h3 className="text-lg font-bold text-zinc-100">
              Reusable Music Library
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Upload your tracks once with complete metadata, BPM, keys, and explicit tags. Submit seamlessly without re-uploading.
            </p>
          </div>
          <div className="pt-6">
            <Link href="/library">
              <Button variant="outline" size="sm" className="w-full">
                Open Library
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col justify-between border-zinc-800 bg-zinc-900/50">
          <div className="space-y-4">
            <div className="h-10 w-10 rounded-md bg-emerald-600/10 flex items-center justify-center text-emerald-400">
              <Radio className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100">
              Live Station Discovery
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Find hosts who are live on Twitch, YouTube, TikTok, and Kick. Join authoritative synchronized queues in real-time.
            </p>
          </div>
          <div className="pt-6">
            <Link href="/hosts">
              <Button variant="outline" size="sm" className="w-full">
                Browse Stations
              </Button>
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col justify-between border-zinc-800 bg-zinc-900/50">
          <div className="space-y-4">
            <div className="h-10 w-10 rounded-md bg-amber-600/10 flex items-center justify-center text-amber-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100">
              Priority Tier Submissions
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Fast-track your track directly to the top of host queues using secure Stripe priority tiers and upgrade existing submissions anytime.
            </p>
          </div>
          <div className="pt-6">
            <Link href="/submissions">
              <Button variant="outline" size="sm" className="w-full">
                My Submissions
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
