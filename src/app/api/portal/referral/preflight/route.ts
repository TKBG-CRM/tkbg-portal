import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/portal/referral/preflight
 * Body: { email: string }
 *
 * Validates that an email belongs to a portal-enabled referral partner before
 * the referral portal login sends a magic link. Runs with the service role so
 * the anon client isn't blocked by RLS on referral_partners / user_profiles.
 *
 * Response:
 *   200 { ok: true }              — safe to send OTP
 *   400 { error: "..." }          — bad input
 *   403 { error: "...", code }    — staff should use the CRM login
 *   404 { error: "...", code }    — no portal-enabled partner with that email
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { email } = await req.json().catch(() => ({ email: null }));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  const trimmed = email.trim().toLowerCase();

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Reject staff addresses so they're steered to the CRM login.
  const { data: staffProfile } = await admin
    .from("user_profiles")
    .select("id")
    .ilike("email", trimmed)
    .maybeSingle();

  if (staffProfile) {
    return NextResponse.json(
      {
        error:
          "This email is a Turnkey staff account. Please sign in to the CRM instead.",
        code: "staff",
      },
      { status: 403 }
    );
  }

  // Only portal-enabled referral partners may use this portal. Resolving by the
  // email keeps the gate strictly server-side — the client never supplies a
  // partner id. `.limit(1)` because email isn't unique on the table.
  const { data: partners } = await admin
    .from("referral_partners")
    .select("id")
    .eq("portal_access", true)
    .ilike("email", trimmed)
    .limit(1);

  if (!partners?.length) {
    return NextResponse.json(
      {
        error:
          "No referral-partner account found for that email. Please contact your Turnkey representative.",
        code: "not_found",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
