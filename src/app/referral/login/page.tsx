"use client";

import { useState } from "react";
import { Loader2, Mail, AlertCircle, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthHeader, AuthPageLabel } from "@/components/AuthHeader";

export default function ReferralLoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);

    const trimmed = email.trim().toLowerCase();

    // Preflight gate: only portal-enabled referral partners may receive a magic
    // link. Rejects staff and unknown emails with a clear message before any
    // email is sent.
    const preflight = await fetch("/api/portal/referral/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: trimmed }),
    });
    if (!preflight.ok) {
      const { error: msg } = await preflight.json().catch(() => ({
        error: "Could not verify account. Please try again.",
      }));
      setError(msg || "Could not verify account. Please try again.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    // After the partner clicks the link, /auth/callback exchanges the code for
    // a session then redirects to /referral.
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/referral`,
        shouldCreateUser: true,
      },
    });

    if (otpErr) {
      setError(otpErr.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col font-body bg-[#f7f5f2]">
      <AuthHeader />

      <div className="flex-1 flex items-start justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-sm">
          {sent ? (
            <div className="text-center space-y-4 py-4">
              <div className="h-14 w-14 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto">
                <Check className="h-7 w-7 text-brand-gold" />
              </div>
              <h2 className="text-lg font-semibold text-black font-heading">
                Check your inbox
              </h2>
              <p className="text-sm text-neutral-500 font-body">
                We sent a secure sign-in link to{" "}
                <span className="font-medium text-black">{email}</span>. Tap the
                link in that email to view your referrals.
              </p>
              <button
                onClick={() => {
                  setSent(false);
                  setError(null);
                }}
                className="text-xs text-brand-gold hover:underline mt-4"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <AuthPageLabel>Referral Partner Portal</AuthPageLabel>
                <h1 className="text-xl font-semibold text-black font-heading">
                  Track your referrals
                </h1>
                <p className="text-sm text-neutral-500 mt-1 font-body">
                  Sign in to see your referred leads and commissions
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-xs text-neutral-600">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="mt-1"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full bg-black hover:bg-neutral-800 text-white uppercase text-xs tracking-widest h-11"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Send sign-in link
                    </>
                  )}
                </Button>

                <p className="text-center text-[11px] text-neutral-400 pt-2 font-body">
                  For Turnkey referral partners. If you&apos;re a client,{" "}
                  <a href="/login" className="text-brand-gold hover:underline">
                    sign in here
                  </a>
                  .
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
