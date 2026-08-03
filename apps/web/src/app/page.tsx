import * as React from 'react';
import { Card, Button, Badge } from '@platform/ui';
import { Music, Radio, Send, Play, Users, Disc } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* Hero Section */}
      <section className="text-center py-12 md:py-20 max-w-3xl mx-auto space-y-6">
        <Badge variant="info" className="px-3 py-1 text-xs">
          Now in Open Alpha
        </Badge>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-indigo-200 to-zinc-50 bg-clip-text text-transparent">
          Connect Your Music Directly to Live Streams
        </h1>
        <p className="text-lg text-zinc-400 max-w-xl mx-auto leading-relaxed">
          The ultimate foundation for music submission and live stream management. Build your library, submit tracks to approved hosts, and listen along live.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button variant="primary" size="lg" className="shadow-lg shadow-violet-500/20">
            <Music className="mr-2 h-4 w-4" /> Get Started
          </Button>
          <Button variant="outline" size="lg">
            <Radio className="mr-2 h-4 w-4" /> View Live Streams
          </Button>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="flex flex-col justify-between">
          <div className="space-y-4">
            <div className="h-10 w-10 rounded-md bg-violet-600/10 flex items-center justify-center text-violet-400">
              <Disc className="h-5 w-5 animate-spin" style={{ animationDuration: '4s' }} />
            </div>
            <h3 className="text-xl font-bold text-zinc-100">Reusable Music Library</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Upload your tracks once and keep them safe in your secure personal library. Keep metadata, artwork, and streaming profiles completely sync'd.
            </p>
          </div>
          <div className="pt-6">
            <Button variant="outline" size="sm" className="w-full">Manage Library</Button>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="space-y-4">
            <div className="h-10 w-10 rounded-md bg-green-600/10 flex items-center justify-center text-green-400">
              <Send className="h-5 w-5" />
            </div>
            <h3 className="text-xl font-bold text-zinc-100">Smart Submission Queue</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Submit your music via flexible queues. Unlock premium features, leverage priority tiers, and receive notifications when your track hits the deck.
            </p>
          </div>
          <div className="pt-6">
            <Button variant="outline" size="sm" className="w-full">Submit Track</Button>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="space-y-4">
            <div className="h-10 w-10 rounded-md bg-indigo-600/10 flex items-center justify-center text-indigo-400">
              <Radio className="h-5 w-5" />
            </div>
            <h3 className="text-xl font-bold text-zinc-100">Live Host Directory</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Find hosts who are currently broadcasting live on Twitch, TikTok, YouTube, or Facebook. Join their queues and interact with the stream.
            </p>
          </div>
          <div className="pt-6">
            <Button variant="outline" size="sm" className="w-full">Browse Stations</Button>
          </div>
        </Card>
      </section>

      {/* Architectural Shell info */}
      <section className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-6 space-y-4">
        <h3 className="text-lg font-bold text-zinc-200">Architectural Note</h3>
        <p className="text-zinc-400 text-sm leading-relaxed">
          This application shell serves as the foundation for the standard user and public website interface. Fully configured with <strong>TypeScript Strict Mode</strong>, <strong>Tailwind CSS v4</strong>, and integrated with the shared <strong>@platform/ui</strong> component package.
        </p>
      </section>
    </div>
  );
}
