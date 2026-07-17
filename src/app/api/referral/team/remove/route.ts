import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

/**
 * POST /api/referral/team/remove
 * Body: { memberId: string }
 *
 * Lets an organisation owner remove one of their own team members. Ownership
 * is enforced server-side: the caller's session email must resolve to a
 * portal-enabled partner, and the target must have parent_partner_id pointing
 * at that partner (which also makes removing yourself or another org's
 * member impossible — their parent isn't you).
 *
 * Two outcomes, chosen by what the member's record is anchoring:
 *   - No referrals and no commissions → the partner row is DELETED outright.
 *   - Any referrals/commissions       → the row is kept for attribution (their
 *     referred jobs and commission history must not go dangling), but they are
 *     DETACHED from the team and their portal access is revoked, so they can
 *     no longer sign in and the owner no longer sees them.
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

  const { data: owners } = await admin
    .from("referral_partners")
    .select("id, name, email, parent_partner_id")
    .eq("portal_access", true)
    .ilike("email", user.email)
    .limit(1);
  const owner = owners?.[0] as { id: string } | undefined;
  if (!owner) {
    return NextResponse.json(
      { error: "No referral partner account for this login." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const memberId = typeof body?.memberId === "string" ? body.memberId : "";
  if (!memberId) {
    return NextResponse.json({ error: "memberId is required." }, { status: 400 });
  }

  const { data: members } = await admin
    .from("referral_partners")
    .select("id, contact_name, name, parent_partner_id")
    .eq("id", memberId)
    .limit(1);
  const member = members?.[0] as
    | { id: string; contact_name: string | null; name: string | null; parent_partner_id: string | null }
    | undefined;
  if (!member || member.parent_partner_id !== owner.id) {
    return NextResponse.json(
      { error: "That person isn't on your team." },
      { status: 403 }
    );
  }

  // Is this record anchoring any history? Referred projects, referred
  // contacts (leads without a project yet), or commission rows.
  const [{ count: projectCount }, { count: contactCount }, { count: commissionCount }] =
    await Promise.all([
      admin
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("referral_partner_id", member.id),
      admin
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("referral_partner_id", member.id),
      admin
        .from("referral_partner_commissions")
        .select("id", { count: "exact", head: true })
        .eq("referral_partner_id", member.id),
    ]);
  const hasHistory =
    (projectCount ?? 0) > 0 || (contactCount ?? 0) > 0 || (commissionCount ?? 0) > 0;

  const label = member.contact_name || member.name || "Team member";

  if (!hasHistory) {
    const { data: deleted, error: delErr } = await admin
      .from("referral_partners")
      .delete()
      .eq("id", member.id)
      .eq("parent_partner_id", owner.id) // re-checked so a concurrent change can't widen the delete
      .select("id");
    if (delErr || !deleted?.length) {
      return NextResponse.json(
        { error: "Could not remove the team member — please try again." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, deleted: true, name: label });
  }

  const { data: updated, error: updErr } = await admin
    .from("referral_partners")
    .update({ parent_partner_id: null, portal_access: false })
    .eq("id", member.id)
    .eq("parent_partner_id", owner.id)
    .select("id");
  if (updErr || !updated?.length) {
    return NextResponse.json(
      { error: "Could not remove the team member — please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, deleted: false, detached: true, name: label });
}
