import type { Metadata } from "next";
import "./globals.css";
import * as React from "react";
import Link from "next/link";
import { Badge } from "@platform/ui";
import { Activity, User, LayoutDashboard, Radio } from "lucide-react";

export const metadata: Metadata = {
  title: "Host Control Center - TheQueue",
  description: "Manage your station, streams, queues, and earnings.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDev = process.env.NODE_ENV === "development" || true;

  return (
    <html lang="en" className="dark h-full">
      <body className="bg-zinc-950 text-zinc-50 min-h-screen flex flex-col antialiased">
        {/* Navigation Bar */}
        <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="flex items-center gap-2 font-bold text-lg text-amber-500 font-sans tracking-wide"
              >
                <LayoutDashboard className="h-5 w-5" />
                <span>TheQueue Host Studio</span>
              </Link>
              <nav className="hidden md:flex gap-6 text-sm font-medium text-zinc-400">
                <Link
                  href="/"
                  className="hover:text-zinc-100 transition-colors"
                >
                  Overview
                </Link>
                <Link
                  href="/station"
                  className="hover:text-zinc-100 transition-colors"
                >
                  Station Config
                </Link>
                <Link
                  href="/queue"
                  className="hover:text-zinc-100 transition-colors"
                >
                  Queue (DJ Panel)
                </Link>
                <Link
                  href="/earnings"
                  className="hover:text-zinc-100 transition-colors"
                >
                  Earnings
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              {/* Host Streaming Status */}
              <div className="flex items-center gap-2">
                <Badge
                  variant="danger"
                  className="text-xs uppercase font-bold tracking-wider animate-pulse"
                >
                  <Radio className="h-3 w-3 mr-1" />
                  Streaming Offline
                </Badge>
              </div>

              {/* Dev Indicators */}
              {isDev && (
                <div className="hidden sm:flex items-center gap-2">
                  <Badge variant="warning">Local Host Shell</Badge>
                  <Badge variant="success">
                    <Activity className="h-3 w-3 mr-1 animate-pulse" />
                    API Connected
                  </Badge>
                </div>
              )}

              <div className="flex items-center gap-2 border-l border-zinc-800 pl-4">
                <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-amber-500">
                  <User className="h-4 w-4" />
                </div>
                <span className="hidden sm:inline text-sm font-medium text-zinc-300">
                  Host Shell
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-zinc-800 bg-zinc-950 py-6 text-center text-sm text-zinc-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>
              © {new Date().getFullYear()} TheQueue Host Services. All rights
              reserved.
            </p>
            <div className="flex gap-6">
              <Link
                href="/help"
                className="hover:text-zinc-300 transition-colors"
              >
                Documentation
              </Link>
              <Link
                href="/support"
                className="hover:text-zinc-300 transition-colors"
              >
                Support
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
