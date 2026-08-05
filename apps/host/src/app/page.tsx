import * as React from "react";
import { Card, Button, Badge } from "@platform/ui";
import {
  Radio,
  Users,
  Sparkles,
  Sliders,
  Play,
  Settings,
  DollarSign,
} from "lucide-react";

export default function HostPage() {
  return (
    <div className="space-y-10">
      {/* Welcome Banner */}
      <section className="bg-gradient-to-r from-amber-600/10 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-lg p-8 md:p-12 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="warning" className="px-3 py-1 text-xs">
              Station Ready
            </Badge>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-zinc-100">
              Welcome Back, Stream Host
            </h1>
            <p className="text-zinc-400 max-w-xl leading-relaxed text-sm md:text-base">
              Set up your live stream overlay, configure submission tiers, open
              your public queues, and manage submitted tracks with the
              browser-based DJ panel.
            </p>
          </div>
          <Button
            variant="primary"
            className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-lg shadow-amber-500/10"
          >
            <Radio className="mr-2 h-4 w-4" /> Go Live
          </Button>
        </div>
      </section>

      {/* Host Feature Metrics Mockup */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 flex items-center gap-4 border-zinc-800 bg-zinc-900/10">
          <div className="p-3 rounded-lg bg-amber-600/10 text-amber-500">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-zinc-500 font-medium">
              Queue Status
            </span>
            <h4 className="text-xl font-bold text-zinc-100">0 Tracks</h4>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4 border-zinc-800 bg-zinc-900/10">
          <div className="p-3 rounded-lg bg-violet-600/10 text-violet-500">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-zinc-500 font-medium">
              Priority Tier
            </span>
            <h4 className="text-xl font-bold text-zinc-100">Active</h4>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4 border-zinc-800 bg-zinc-900/10">
          <div className="p-3 rounded-lg bg-green-600/10 text-green-500">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-zinc-500 font-medium">
              Monthly Revenue
            </span>
            <h4 className="text-xl font-bold text-zinc-100">$0.00</h4>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4 border-zinc-800 bg-zinc-900/10">
          <div className="p-3 rounded-lg bg-blue-600/10 text-blue-500">
            <Play className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs text-zinc-500 font-medium">
              Streaming On
            </span>
            <h4 className="text-xl font-bold text-zinc-100">None</h4>
          </div>
        </Card>
      </section>

      {/* Grid Actions */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <div className="h-10 w-10 rounded-md bg-amber-600/10 flex items-center justify-center text-amber-500">
            <Sliders className="h-5 w-5" />
          </div>
          <h3 className="text-xl font-bold text-zinc-100">
            Station Configuration
          </h3>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Configure stream branding, submission thresholds, upload formats,
            free line settings, and priority tier structures. Centralize your
            overlay browser source settings.
          </p>
          <div className="pt-4 flex gap-3">
            <Button variant="outline" size="sm">
              Edit Settings
            </Button>
            <Button variant="ghost" size="sm">
              View Live Preview
            </Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="h-10 w-10 rounded-md bg-violet-600/10 flex items-center justify-center text-violet-500">
            <Play className="h-5 w-5" />
          </div>
          <h3 className="text-xl font-bold text-zinc-100">
            Browser-based DJ Panel
          </h3>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Manage your submissions live. Reorder, skip, play, preview metadata,
            and monitor host audio directly inside the browser. Feed active
            stream artwork to overlays.
          </p>
          <div className="pt-4">
            <Button variant="outline" size="sm" className="w-full">
              Open DJ Control Panel
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
