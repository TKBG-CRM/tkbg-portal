"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, Check } from "lucide-react";

type Mode = "login" | "forgot";

// Map the ?error= codes the admin-preview / auth-callback flows emit
// into something a rep / client can actually act on. Without this the
// preview flow could bounce someone here with no explanation.
const ERROR_MESSAGES: Record<string, string> = {
  invalid_token:
    "That preview link has expired. Head back to the CRM and open the portal again.",
  no_portal_account:
    "This client hasn't completed their portal registration yet, so there's no portal account to preview as.",
  link_failed:
    "We couldn't establish a portal session for that client. Try opening the portal again — if it keeps happening, ask the client to reset their portal password.",
  session_failed:
    "Couldn't sign you in to preview that portal. Try opening it again from the CRM.",
  server_error: "Server hiccup. Try again shortly.",
  auth: "Your session expired or the link was already used. Please sign in.",
};

// useSearchParams() needs a <Suspense> boundary for Next.js prerender.
// Wrap the actual form in a child component and render it inside
// Suspense from the default export.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // Surface ?error=… from the preview / auth callback flows so the
  // user knows why they landed back at the login screen.
  useEffect(() => {
    const code = searchParams?.get("error");
    if (code && ERROR_MESSAGES[code]) setError(ERROR_MESSAGES[code]);
  }, [searchParams]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    const trimmed = email.trim().toLowerCase();
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });

    if (signInErr) {
      setError(
        signInErr.message.toLowerCase().includes("invalid")
          ? "Incorrect email or password. Please try again."
          : signInErr.message
      );
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);

    const trimmed = email.trim().toLowerCase();
    // Send users straight to /reset-password (not via /auth/callback).
    // Supabase appends the recovery params to the redirect URL and the
    // browser client auto-detects them on page load — same-device
    // PKCE and cross-device hash-fragment flows both work without
    // needing the round-trip through a route handler.
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      trimmed,
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    if (resetErr) {
      setError(resetErr.message || "Could not send reset email. Please try again.");
      setLoading(false);
      return;
    }

    setResetSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col font-body bg-[#f7f5f2]">
      {/* Black header bar — matches portal header + branded email template */}
      <div className="bg-black px-4 py-10 sm:py-14 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/TURNKEY_WORDMARK_WHITE.svg"
          alt="Turnkey Building Group"
          className="h-4 sm:h-5 mx-auto"
        />
        <p className="mt-3 text-[9px] uppercase tracking-[0.25em] text-brand-gold font-body font-medium">
          Client Portal
        </p>
      </div>

      {/* Gold accent line */}
      <div className="h-[2px] bg-brand-gold" />

      {/* Form */}
      <div className="flex-1 flex items-start justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-sm">
          {mode === "forgot" && resetSent ? (
            <div className="text-center space-y-4 py-4">
              <div className="h-14 w-14 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto">
                <Check className="h-7 w-7 text-brand-gold" />
              </div>
              <h2 className="text-lg font-semibold text-black font-heading">
                Check your inbox
              </h2>
              <p className="text-sm text-neutral-500 font-body">
                We sent a password reset link to{" "}
                <span className="font-medium text-black">{email}</span>.
              </p>
              <button
                onClick={() => {
                  setMode("login");
                  setResetSent(false);
                  setError(null);
                }}
                className="text-xs text-brand-gold hover:underline mt-4"
              >
                Back to sign in
              </button>
            </div>
          ) : mode === "login" ? (
            <>
              <div className="text-center mb-8">
                <h1 className="text-xl font-semibold text-black font-heading">
                  Welcome back
                </h1>
                <p className="text-sm text-neutral-500 mt-1 font-body">
                  Sign in to view your project
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
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

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs text-neutral-600">
                      Password
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot");
                        setError(null);
                      }}
                      className="text-[11px] text-brand-gold hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                  disabled={loading || !email || !password}
                  className="w-full bg-black hover:bg-neutral-800 text-white uppercase text-xs tracking-widest h-11"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Log In"
                  )}
                </Button>

                <p className="text-center text-[11px] text-neutral-400 pt-2 font-body">
                  Only registered clients can access the portal.
                </p>
              </form>
            </>
          ) : (
            <>
              <div className="text-center mb-8">
                <h1 className="text-xl font-semibold text-black font-heading">
                  Reset your password
                </h1>
                <p className="text-sm text-neutral-500 mt-1 font-body">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <Label htmlFor="email-forgot" className="text-xs text-neutral-600">
                    Email address
                  </Label>
                  <Input
                    id="email-forgot"
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
                    "Send Reset Link"
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="w-full text-center text-xs text-brand-gold hover:underline pt-2"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
