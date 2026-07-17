import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import {
  MAX_SELF_SERVE_TEAM,
  validateTeamMember,
} from "@/lib/referral/team-signup";

/**
 * POST /api/referral/team/add
 * Body: { name: string, email: string }
 *
 * Lets a signed-in referral partner add a team member to their organisation
 * WITHOUT waiting for Turnkey staff — the trust boundary is the email domain:
 * the new member's address must be on the same business domain as the owner's
 * verified login email (free mailbox domains can never self-serve; see
 * team-signup.ts). The new member becomes a portal-enabled referral_partners
 * row with parent_partner_id pointing at the owner, so:
 *   - the owner's dashboard immediately includes them in the team view, and
 *   - the member can sign in with their own email and see ONLY their referrals.
 *
 * Guards beyond the domain match:
 *   - the caller must resolve to a portal-enabled partner (same session-email
 *     gate as every referral read) who is NOT someone else's team member —
 *     only owners/solo partners can build a team (one level deep);
 *   - the email must not already be a partner or a Turnkey staff account;
 *   - team size is capped as an abuse backstop.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const admin = createServiceRoleClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Resolve the calling partner exactly like the referral pages do.
  const { data: owners } = await admin
    .from("referral_partners")
    .select("id, name, email, parent_partner_id")
    .eq("portal_access", true)
    .ilike("email", user.email)
    .limit(1);
  const owner = owners?.[0] as
    | { id: string; name: string | null; email: string | null; parent_partner_id?: string | null }
    | undefined;
  if (!owner) {
    return NextResponse.json(
      { error: "No referral partner account for this login." },
      { status: 403 }
    );
  }
  if (owner.parent_partner_id) {
    return NextResponse.json(
      { error: "Only the organisation owner can add team members." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const check = validateTeamMember(owner.email || user.email, body?.name, body?.email);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  // Abuse backstop, not a product limit.
  const { count } = await admin
    .from("referral_partners")
    .select("id", { count: "exact", head: true })
    .eq("parent_partner_id", owner.id);
  if ((count ?? 0) >= MAX_SELF_SERVE_TEAM) {
    return NextResponse.json(
      { error: "Team limit reached — contact Turnkey to add more members." },
      { status: 400 }
    );
  }

  // Never create a second partner row for an email that already has one (the
  // login resolver takes the first match — a duplicate could shadow the
  // existing account). Turnkey staff can link an existing partner via the CRM.
  const { data: existing } = await admin
    .from("referral_partners")
    .select("id")
    .ilike("email", check.email)
    .limit(1);
  if (existing?.length) {
    return NextResponse.json(
      {
        error:
          "That email already belongs to a referral partner. Ask Turnkey to add them to your team.",
      },
      { status: 409 }
    );
  }

  // Staff accounts can't double as referral partners (mirrors send-link).
  const { data: staff } = await admin
    .from("user_profiles")
    .select("id")
    .ilike("email", check.email)
    .maybeSingle();
  if (staff) {
    return NextResponse.json(
      { error: "That email belongs to a Turnkey staff account." },
      { status: 400 }
    );
  }

  const { error: insertErr } = await admin.from("referral_partners").insert({
    name: owner.name, // the organisation/business name carries over
    contact_name: check.name,
    email: check.email,
    parent_partner_id: owner.id,
    portal_access: true,
    portal_invited_at: new Date().toISOString(),
  });
  if (insertErr) {
    console.error("[referral-team-add] insert failed", insertErr);
    return NextResponse.json(
      { error: "Could not add the team member — please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, name: check.name, email: check.email });
}
