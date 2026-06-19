"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthHeader, AuthPageLabel } from "@/components/AuthHeader";
import { SplashGate } from "@/components/SplashGate";

type RecoveryStatus = "loading" | "ready" | "expired";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>("loading");

  // Establish the recovery session as soon as the page mounts.
  //
  // Supabase can deliver the recovery token in three shapes:
  //   1. ?code=<auth_code>                        — PKCE flow
  //   2. ?token_hash=<hash>&type=recovery         — server-verified OTP
  //   3. #access_token=...&refresh_token=...      — implicit / hash flow
  //
  // The browser client's detectSessionInUrl handles (1) and (3) auto-
  // matically. We explicitly verify (2) ourselves so the email link
  // works cross-device even when Supabase's email template is using
  // the token_hash variant.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");

      if (tokenHash && (type === "recovery" || type === "email")) {
        const { error: vErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (cancelled) return;
        if (vErr) {
          setRecoveryStatus("expired");
          return;
        }
        // Strip the params so a refresh doesn't re-verify a now-spent token.
        url.searchParams.delete("token_hash");
        url.searchParams.delete("type");
        window.history.replaceState({}, "", url.pathname + url.hash);
      }

      // detectSessionInUrl picks up ?code= and #access_token=... on
      // page load asynchronously. Poll briefly for a session before
      // declaring the link expired.
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (!cancelled) setRecoveryStatus("ready");
          return;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!cancelled) {
        setRecoveryStatus(
          (await supabase.auth.getSession()).data.session ? "ready" : "expired"
        );
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);

    const { error: updErr } = await supabase.auth.updateUser({ password });

    if (updErr) {
      setError(
        updErr.message.toLowerCase().includes("session")
          ? "Your reset link has expired. Please request a new one from the login page."
          : updErr.message
      );
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col font-body bg-[#f7f5f2]">
      <SplashGate />
      <AuthHeader />

      <div className="flex-1 flex items-start justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <AuthPageLabel>Client Portal</AuthPageLabel>
            <h1 className="text-xl font-semibold text-black font-heading">
              {done ? "Password updated" : "Set a new password"}
            </h1>
            <p className="text-sm text-neutral-500 mt-1 font-body">
              {done
                ? "You can now sign in with your new password"
                : "Create a new password for your client portal"}
            </p>
          </div>

          {done ? (
            <div className="text-center space-y-4 py-4">
              <div className="h-14 w-14 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto">
                <Check className="h-7 w-7 text-brand-gold" />
              </div>
              <p className="text-sm text-neutral-500 font-body">
                Your password has been updated successfully.
              </p>
              <Button
                onClick={() => router.push("/login")}
                className="bg-black hover:bg-neutral-800 text-white uppercase text-xs tracking-widest h-11"
              >
                Go to sign in
              </Button>
            </div>
          ) : recoveryStatus === "loading" ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-sm text-neutral-500">
              <Loader2 className="h-6 w-6 animate-spin text-brand-gold" />
              Verifying your reset link…
            </div>
          ) : recoveryStatus === "expired" ? (
            <div className="text-center space-y-4 py-4">
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 text-left">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  This reset link has expired or is invalid. Reset links
                  are good for one use only — request a new one from the
                  login page.
                </span>
              </div>
              <Button
                onClick={() => router.push("/login")}
                className="bg-black hover:bg-neutral-800 text-white uppercase text-xs tracking-widest h-11"
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="new-password" className="text-xs text-neutral-600">
                  New password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  autoFocus
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="confirm-password" className="text-xs text-neutral-600">
                  Confirm password
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="Type it again"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                disabled={loading || !password || !confirm}
                className="w-full bg-black hover:bg-neutral-800 text-white uppercase text-xs tracking-widest h-11"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
