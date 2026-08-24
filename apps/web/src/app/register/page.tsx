"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { Radio, Lock, Mail, User, Eye, EyeOff, ArrowRight, CheckCircle2, Music2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const { siteName } = useTheme();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !displayName || !password) {
      setError("Please fill out all registration fields.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await register({
        email,
        username,
        displayName,
        password,
      });

      if (res.success) {
        router.push("/account");
      } else {
        setError(res.message || "Failed to create account.");
      }
    } catch {
      setError("An unexpected error occurred during account creation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 items-center justify-center text-white shadow-lg shadow-violet-500/25 mb-2">
            <Music2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Create your {siteName || "TheQueue"} Account
          </h1>
          <p className="text-sm text-zinc-400">
            Join independent artists submitting music to live streamers and hosts.
          </p>
        </div>

        {/* Registration Form Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 backdrop-blur-xl p-6 sm:p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-medium">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 block">
                Email Address
              </label>
              <input
                type="email"
                id="register-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="producer@example.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-colors"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 block">
                Username
              </label>
              <input
                type="text"
                id="register-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. cyber_producer"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-colors"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 block">
                Artist / Display Name
              </label>
              <input
                type="text"
                id="register-displayname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Astral Motion"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-colors"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 block">
                Password (min 8 characters)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="register-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 pr-10 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              id="register-submit-button"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white shadow-md shadow-violet-600/30 flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <span>Creating Account...</span>
              ) : (
                <>
                  <span>Create Artist Account</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
            <p className="text-xs text-zinc-400">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-violet-400 hover:text-violet-300 transition-colors"
              >
                Sign in instead
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
