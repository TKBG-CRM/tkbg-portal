"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { AuthHeader, AuthPageLabel } from "@/components/AuthHeader";

type Status = "loading" | "expired";

function VerifyInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<Status>("loading");

  // Establish the session from the magic-link token_hash, then land on the
  // referral dashboard. Verifying the token_hash ourselves (rather than relying
  // on a Supabase redirect) keeps the whole flow on this domain and works
  // cross-device.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");
      const rawType = url.searchParams.get("type");
      const type: EmailOtpType =
        rawType === "magiclink" || rawType === "email" ? rawType : "magiclink";

      if (!tokenHash) {
        // Maybe already signed in (e.g. link opened twice) — check for a session.
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          if (data.session) router.replace("/referral");
          else setStatus("expired");
        }
        return;
      }

      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (cancelled) return;
      if (error) {
        setStatus("expired");
        return;
      }
      router.replace("/referral");
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  return (
    <div className="min-h-screen flex flex-col font-body bg-[#f7f5f2]">
      <AuthHeader />
      <div className="flex-1 flex items-start justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <AuthPageLabel>Referral Partner Portal</AuthPageLabel>
            <h1 className="text-xl font-semibold text-black font-heading">
              {status === "expired" ? "Link expired" : "Signing you in"}
            </h1>
          </div>

          {status === "loading" ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-sm text-neutral-500">
              <Loader2 className="h-6 w-6 animate-spin text-brand-gold" />
              Verifying your sign-in link…
            </div>
          ) : (
            <div className="text-center space-y-4 py-4">
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 text-left">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  This sign-in link has expired or was already used. Links are
                  good for one use only — request a new one from the sign-in
                  screen.
                </span>
              </div>
              <Button
                onClick={() => router.push("/referral/login")}
                className="bg-black hover:bg-neutral-800 text-white uppercase text-xs tracking-widest h-11"
              >
                Back to sign in
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReferralVerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}
