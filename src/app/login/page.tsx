"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center gap-4 mb-10">
          <img
            src="/logos/TURNKEY_LOGO_GOLD.svg"
            alt="Turnkey Building Group"
            className="h-36"
          />
          <p className="text-xs text-gray-400 tracking-wide">
            Client Portal
          </p>
        </div>

        <Card className="border border-gray-200">
          <CardHeader className="pb-4 pt-6 px-6">
            {!sent ? (
              <p className="text-sm text-gray-500 text-center">
                Enter your email to receive a secure login link
              </p>
            ) : (
              <div className="text-center space-y-3">
                <CheckCircle2 className="h-10 w-10 text-[#957B60] mx-auto" />
                <p className="text-base font-medium text-black">Check your email</p>
                <p className="text-sm text-gray-500">
                  We sent a login link to <span className="font-medium text-black">{email}</span>
                </p>
              </div>
            )}
          </CardHeader>

          {!sent && (
            <CardContent className="px-6 pb-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-gray-600">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 border-gray-200"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full bg-[#957B60] hover:bg-[#7a6550] text-white"
                  disabled={loading || !email}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Login Link"
                  )}
                </Button>
              </form>

              <p className="text-xs text-gray-400 text-center mt-6">
                No password needed. We&apos;ll email you a secure link.
              </p>
            </CardContent>
          )}

          {sent && (
            <CardContent className="px-6 pb-6">
              <div className="space-y-3 text-center">
                <p className="text-xs text-gray-400">
                  Didn&apos;t receive the email? Check your spam folder or
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-gray-200 text-gray-600"
                  onClick={() => { setSent(false); setEmail(""); }}
                >
                  Try again
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
