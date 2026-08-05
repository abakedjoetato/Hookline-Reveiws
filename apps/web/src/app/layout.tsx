import type { Metadata } from "next";
import "./globals.css";
import * as React from "react";
import Link from "next/link";
import { Badge } from "@platform/ui";
import { Activity, Shield, User, Globe, Radio } from "lucide-react";

export const metadata: Metadata = {
  title: "TheQueue - Music Submissions",
  description: "Submit your music to approved host live stream channels",
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
                className="flex items-center gap-2 font-bold text-lg text-violet-500 font-sans tracking-wide"
              >
                <Radio className="h-5 w-5 animate-pulse" />
                <span>TheQueue</span>
              </Link>
              <nav className="hidden md:flex gap-6 text-sm font-medium text-zinc-400">
                <Link
                  href="/"
                  className="hover:text-zinc-100 transition-colors"
                >
                  Home
                </Link>
                <Link
                  href="/library"
                  className="hover:text-zinc-100 transition-colors"
                >
                  Music Library
                </Link>
                <Link
                  href="/hosts"
                  className="hover:text-zinc-100 transition-colors"
                >
                  Live Stations
                </Link>
                <Link
                  href="/submissions"
                  className="hover:text-zinc-100 transition-colors"
                >
                  Submissions
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              {/* Development Environment Indicator */}
              {isDev && (
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="hidden sm:inline-flex">
                    <span className="relative flex h-2 w-2 mr-1">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    Local Dev
                  </Badge>
                  <Badge variant="success" className="text-xs">
                    <Activity className="h-3 w-3 mr-1 animate-pulse" />
                    API Connected
                  </Badge>
                </div>
              )}

              <div className="flex items-center gap-2 border-l border-zinc-800 pl-4">
                <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300">
                  <User className="h-4 w-4" />
                </div>
                <span className="hidden sm:inline text-sm font-medium text-zinc-300">
                  User Shell
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
            <p>© {new Date().getFullYear()} TheQueue. All rights reserved.</p>
            <div className="flex gap-6">
              <Link
                href="/privacy"
                className="hover:text-zinc-300 transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="hover:text-zinc-300 transition-colors"
              >
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
