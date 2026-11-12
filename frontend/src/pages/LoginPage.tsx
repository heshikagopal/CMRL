import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Lock, ShieldCheck, TrainFront, User } from "lucide-react";
import { getApiErrorMessage } from "@/api/client";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Authentication failed. Please check your credentials."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0A192F] lg:flex-row">
      {/* Left Enterprise Control Panel Branding */}
      <div className="relative flex flex-1 flex-col justify-between overflow-hidden p-8 text-white sm:p-12">
        <div className="absolute inset-0 opacity-10">
          <svg viewBox="0 0 800 800" className="h-full w-full">
            <path d="M 80 700 L 320 460 L 320 220 L 660 80" fill="none" stroke="#0066B3" strokeWidth="18" />
            <path d="M 180 180 L 320 220 L 540 420 L 720 650" fill="none" stroke="#009E49" strokeWidth="18" />
          </svg>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#0066B3] to-[#009E49] shadow-lg">
            <TrainFront className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-wider uppercase text-sky-300">Chennai Metro Rail Limited</p>
            <p className="text-xs text-slate-300">Nandanam Head Office (MetroS) • IT Governance Portal</p>
          </div>
        </div>

        <div className="relative z-10 my-10 max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Nandanam HQ Enterprise Control Room
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            CMRL Nandanam HQ IT Asset Management &amp; Monitoring
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Centralized lifecycle tracking, permanent asset identification, QR verification, fault ticketing, 2F Central Store inventory control, and real-time building zone telemetry across CMRL Head Office (MetroS, Nandanam).
          </p>

          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
            <div>
              <p className="font-mono text-lg font-bold text-[#38BDF8]">Nandanam HQ</p>
              <p className="text-xs text-slate-400">Floors B1 – 5F Zones</p>
            </div>
            <div>
              <p className="font-mono text-lg font-bold text-[#34D399]">DC &amp; IT Store</p>
              <p className="text-xs text-slate-400">MetroS Core &amp; Spares</p>
            </div>
            <div>
              <p className="font-mono text-lg font-bold text-white">QR + Audit</p>
              <p className="text-xs text-slate-400">Immutable Lifecycle</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-400">
          Internal Enterprise Prototype • Fictional Demo Data • Not connected to live operational railway signalling.
        </p>
      </div>

      {/* Right Authentication Form */}
      <div className="flex w-full items-center justify-center bg-white p-6 dark:bg-slate-900 sm:p-12 lg:w-[480px]">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex h-1.5 w-20 overflow-hidden rounded-full">
            <div className="w-1/2 bg-[#0066B3]" />
            <div className="w-1/2 bg-[#009E49]" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Sign in to CMRL ITAM</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Enter your authorized employee username or email to access the dashboard.
          </p>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Username or Email
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username or email"
                  className="pl-9"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="w-full" size="lg">
              {submitting ? "Authenticating..." : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Protected by JWT Session &amp; Role-Based Access Control. Refer to local setup documentation for demo role accounts.
          </p>
        </div>
      </div>
    </div>
  );
}
