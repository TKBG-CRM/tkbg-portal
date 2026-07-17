import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/portal/referral/send-link
 * Body: { email: string }
 *
 * Branded magic-link sign-in for referral partners — replaces Supabase's default
 * magic-link email (which also can't be trusted to redirect to this domain,
 * since Supabase falls back to the project Site URL / redirect allowlist).
 *
 *   1. Validate the email belongs to a portal-enabled referral_partners row
 *      (and isn't a staff account). Returns explicit 403/404 so the login page
 *      can show a helpful message.
 *   2. Ensure a passwordless auth user exists for the email (a first-time
 *      partner has no auth.users row yet), then mint a magic-link token via the
 *      admin API. generateLink does NOT send Supabase's email — we own delivery.
 *   3. Build a /referral/verify?token_hash=…&type=magiclink link on THIS domain.
 *      The token_hash (verifyOtp) path establishes the session client-side, so
 *      it works cross-device and never depends on Supabase's redirect config.
 *   4. Hand the branded send to the CRM (it owns the Gmail-backed transactional
 *      email infra + Turnkey templates), via the shared INTERNAL_WEBHOOK_SECRET.
 *
 * Public by design (allow-listed in middleware): it uses the service role.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({ email: null }));
  const rawEmail = body && typeof body === "object" ? body.email : null;
  if (!rawEmail || typeof rawEmail !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  const email = rawEmail.trim().toLowerCase();

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Validate: a portal-enabled partner ALWAYS gets in ─────────────────────
  // The partner lookup runs FIRST and wins. It used to run after the staff
  // check, but the handle_new_user trigger creates a user_profiles row for
  // every auth user this very route creates (first sign-in), so from a
  // partner's SECOND visit onward the profile-row-exists check misread them
  // as Turnkey staff and locked them out. A row in referral_partners with
  // portal_access is the authoritative signal; the staff message is only for
  // emails that are NOT partners.
  const { data: partners } = await admin
    .from("referral_partners")
    .select("id, contact_name, name")
    .eq("portal_access", true)
    .ilike("email", email)
    .limit(1);
  const partner = partners?.[0];
  if (!partner) {
    const { data: staffProfile } = await admin
      .from("user_profiles")
      .select("id")
      .ilike("email", email)
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
    return NextResponse.json(
      {
        error:
          "No referral-partner account found for that email. Please contact your Turnkey representative.",
        code: "not_found",
      },
      { status: 404 }
    );
  }

  // ── Ensure a passwordless auth user exists, then mint a magic-link token ───
  // createUser errors if the user already exists — that's fine, we ignore it and
  // move on to generateLink (which needs the user to exist). The source marker
  // tells the handle_new_user trigger (migration 102) NOT to mint a staff
  // user_profiles row for this partner login.
  await admin.auth.admin
    .createUser({
      email,
      email_confirm: true,
      user_metadata: { source: "referral_partner_portal" },
    })
    .catch(() => undefined);

  let hashedToken: string | null = null;
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error) {
      console.error("[referral send-link] generateLink error:", error.message);
    } else {
      hashedToken = data?.properties?.hashed_token ?? null;
    }
  } catch (err) {
    console.error("[referral send-link] generateLink threw", err);
  }

  if (!hashedToken) {
    return NextResponse.json(
      { error: "Could not create a sign-in link. Please try again." },
      { status: 502 }
    );
  }

  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    req.nextUrl.origin
  ).replace(/\/$/, "");
  const signInUrl = `${base}/referral/verify?token_hash=${encodeURIComponent(
    hashedToken
  )}&type=magiclink`;

  const name = (
    (partner.contact_name as string | null) ||
    (partner.name as string | null) ||
    ""
  ).trim();

  const sent = await sendBrandedSignInEmail({ email, name, signInUrl });
  if (!sent) {
    return NextResponse.json(
      { error: "Could not send the sign-in email. Please try again shortly." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * Hand the branded send to the CRM (POST /api/internal/send-referral-signin),
 * mirroring the password-reset webhook. Returns whether it was accepted.
 */
async function sendBrandedSignInEmail(payload: {
  email: string;
  name: string;
  signInUrl: string;
}): Promise<boolean> {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[referral send-link] INTERNAL_WEBHOOK_SECRET not set — cannot send branded email"
    );
    return false;
  }
  const crmUrl = (
    process.env.NEXT_PUBLIC_CRM_URL || "https://crm.tkbg.com.au"
  ).replace(/\/$/, "");
  try {
    const res = await fetch(`${crmUrl}/api/internal/send-referral-signin`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: payload.email,
        name: payload.name,
        sign_in_url: payload.signInUrl,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        "[referral send-link] CRM send-referral-signin non-OK",
        res.status,
        detail
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[referral send-link] CRM send-referral-signin failed", err);
    return false;
  }
}
