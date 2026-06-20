import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Branded password-reset trigger — replaces Supabase's default supabase.io
 * recovery email.
 *
 *   1. Mint a real Supabase recovery token via the admin API (generateLink).
 *      generateLink returns the token WITHOUT sending Supabase's own email, so
 *      we own delivery.
 *   2. Build a /reset-password?token_hash=…&type=recovery link. The token_hash
 *      (verifyOtp) path works cross-device — unlike the PKCE ?code= link the old
 *      resetPasswordForEmail flow produced, which silently failed whenever the
 *      email was opened on a different device/browser than the one that
 *      requested the reset (no PKCE code_verifier present to exchange). That was
 *      the root cause of the "reset link doesn't work" bug.
 *   3. Hand the branded send to the CRM (it owns the Gmail-backed transactional
 *      email infra + Turnkey templates), via the shared INTERNAL_WEBHOOK_SECRET.
 *
 * Always returns a generic 200 so the endpoint never reveals whether an account
 * exists for the address. Public by design (allow-listed in middleware): it uses
 * the service role itself and discloses nothing.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[forgot-password] Supabase service env not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const email = (body && typeof body === "object" ? String(body.email ?? "") : "")
    .trim()
    .toLowerCase();
  // Don't leak which inputs are valid — always answer with generic success.
  if (!email || !email.includes("@")) return NextResponse.json({ ok: true });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Mint a recovery token. generateLink does NOT send an email — we deliver our
  // own branded one. A non-existent user makes this error; we swallow it so the
  // response stays generic (no account enumeration).
  let hashedToken: string | null = null;
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error) {
      console.info("[forgot-password] generateLink declined:", error.message);
    } else {
      hashedToken = data?.properties?.hashed_token ?? null;
    }
  } catch (err) {
    console.error("[forgot-password] generateLink threw", err);
  }

  if (!hashedToken) return NextResponse.json({ ok: true });

  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    req.nextUrl.origin
  ).replace(/\/$/, "");
  const resetUrl = `${base}/reset-password?token_hash=${encodeURIComponent(
    hashedToken
  )}&type=recovery`;

  // Best-effort personalisation: the CRM shares this Supabase DB, so grab the
  // contact's first name for the greeting. Never block the reset on this.
  let name = "";
  try {
    const { data: contact } = await admin
      .from("contacts")
      .select("first_name")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    name = ((contact?.first_name as string | null) || "").trim();
  } catch {
    // ignore — the CRM will resolve / fall back to a generic greeting
  }

  await sendBrandedResetEmail({ email, name, resetUrl });

  return NextResponse.json({ ok: true });
}

/**
 * Hand the branded send to the CRM (POST /api/internal/send-password-reset).
 * Best-effort from the user's POV: any failure is logged but the caller still
 * sees the generic success response — mirrors the register → CRM webhook.
 */
async function sendBrandedResetEmail(payload: {
  email: string;
  name: string;
  resetUrl: string;
}): Promise<void> {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[forgot-password] INTERNAL_WEBHOOK_SECRET not set — cannot send branded reset email"
    );
    return;
  }
  const crmUrl = (
    process.env.NEXT_PUBLIC_CRM_URL || "https://crm.tkbg.com.au"
  ).replace(/\/$/, "");
  try {
    const res = await fetch(`${crmUrl}/api/internal/send-password-reset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: payload.email,
        name: payload.name,
        reset_url: payload.resetUrl,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        "[forgot-password] CRM send-password-reset returned non-OK",
        res.status,
        detail
      );
    }
  } catch (err) {
    console.error("[forgot-password] CRM send-password-reset failed", err);
  }
}
