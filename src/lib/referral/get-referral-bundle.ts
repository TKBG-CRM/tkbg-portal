import { createClient } from "@/lib/supabase/server";
import {
  createClient as createServiceRoleClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  referralMilestone,
  type ReferralMilestone,
} from "./referral-status";
import {
  allowedPartnerIds,
  partnerLabelById,
  type TeamMember,
} from "./team";
import { canSelfServeTeam } from "./team-signup";

/**
 * Referral-partner portal data loader (portal app).
 *
 * A referral partner is a `referral_partners` row (the standalone identity the
 * CRM's attribution + combobox use). Partners log in by magic link (email OTP),
 * so the only thing we trust is the verified email on their Supabase session —
 * we NEVER accept a partner id from the client. From that session email we
 * resolve the partner row (gated on `portal_access = true`), then scope every
 * read to that partner id:
 *
 *     referral_partners ──(id)── projects.referral_partner_id
 *     referral_partners ──(id)── referral_partner_commissions.referral_partner_id
 *
 * A partner may ALSO be a client (linked via referral_partners.contact_id). The
 * two roles never mix here: this bundle only ever returns leads the partner
 * *referred*, never their own client project.
 *
 * ORGANISATIONS: a partner row may carry `parent_partner_id` pointing at
 * another partner — the child is a staff member of the parent's organisation
 * (e.g. Finance Family brokers under the owner). The owner's session widens to
 * their own id + all children (each row tagged with who referred it); a staff
 * session has no children so it stays scoped to exactly their own referrals.
 * The allowed-id set is ALWAYS derived server-side from the verified session
 * email — never from anything the client sends — so one organisation can never
 * read another's leads.
 *
 * We use the service role because there is no per-partner RLS policy (partners
 * aren't linked to an auth.users row the way registered clients are). The
 * session email is the gate; queries are strictly scoped by the resolved partner
 * id, and the projected columns are a referral-safe whitelist — NO internal
 * notes (only the curated referral_partner_note), NO pricing, NO other partners.
 */

function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceRoleClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type ReferralPartner = {
  id: string;
  name: string | null;
  contact_name: string | null;
  email: string | null;
};

export type ReferredLead = {
  id: string;
  projectName: string | null;
  clientName: string | null;
  referredOn: string | null;
  milestone: ReferralMilestone;
  hasNote: boolean;
  /** Which partner in the organisation referred this lead (owner view only). */
  referredById: string | null;
  referredBy: string | null;
};

export type PartnerCommission = {
  id: string;
  projectName: string | null;
  clientName: string | null;
  amount: number;
  status: string; // pending | due | paid | cancelled
  dueDate: string | null;
  paidDate: string | null;
  referredById: string | null;
  referredBy: string | null;
};

export type ReferralBundle = {
  partner: ReferralPartner | null;
  /** Partners reporting to the signed-in partner — non-empty only for an organisation owner. */
  team: TeamMember[];
  /** Whether this partner may self-serve team members (business email domain,
   * not themselves someone's team member). */
  canAddTeam: boolean;
  leads: ReferredLead[];
  commissions: PartnerCommission[];
  totals: { pending: number; paid: number; leadCount: number; convertedCount: number };
};

export type ReferralLeadDetail = {
  partner: ReferralPartner;
  lead: ReferredLead;
  note: string | null;
  commissions: PartnerCommission[];
};

const EMPTY_TOTALS = { pending: 0, paid: 0, leadCount: 0, convertedCount: 0 };

/**
 * Resolve the referral partner for the current Supabase session, or null when
 * there's no session / the email doesn't map to a portal-enabled partner.
 */
async function resolveSessionPartner(): Promise<{
  admin: SupabaseClient;
  partner: ReferralPartner;
  team: TeamMember[];
  hasOwner: boolean;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = serviceRoleClient();
  if (!admin) return null;

  // Gated on portal_access so a partner can't sign in until staff enable it.
  // `.limit(1)` (not maybeSingle) because email isn't unique on the table —
  // the first portal-enabled match wins.
  const { data: partners } = await admin
    .from("referral_partners")
    .select("id, name, contact_name, email, portal_activated_at")
    .eq("portal_access", true)
    .ilike("email", user.email)
    .limit(1);

  const row = (partners?.[0] as
    | (ReferralPartner & { portal_activated_at?: string | null })
    | undefined) ?? null;
  if (!row) return null;

  // Stamp the first successful portal sign-in so staff can see the partner is an
  // active user (CRM Partners → Portal). Only the first time; fire-and-forget so
  // it never slows the dashboard load or fails it.
  if (!row.portal_activated_at) {
    void admin
      .from("referral_partners")
      .update({ portal_activated_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("portal_activated_at", null)
      .then(() => undefined);
  }

  const partner: ReferralPartner = {
    id: row.id,
    name: row.name,
    contact_name: row.contact_name,
    email: row.email,
  };

  // Organisation team: partners whose parent_partner_id points at this
  // partner. Non-owners (and solo partners) simply get an empty list. A query
  // error (e.g. the column not existing yet) degrades to solo behaviour
  // rather than breaking the portal.
  const { data: teamRows } = await admin
    .from("referral_partners")
    .select("id, name, contact_name")
    .eq("parent_partner_id", partner.id)
    .order("contact_name", { ascending: true });
  const team: TeamMember[] = (teamRows ?? []) as TeamMember[];

  // Whether this partner is themselves someone's team member (staff can't
  // build teams of their own — one level only). Queried separately from the
  // main partner row so a missing column pre-migration degrades to false.
  const { data: parentRow } = await admin
    .from("referral_partners")
    .select("parent_partner_id")
    .eq("id", partner.id)
    .maybeSingle();
  const hasOwner = !!(parentRow as { parent_partner_id?: string | null } | null)
    ?.parent_partner_id;

  return { admin, partner, team, hasOwner };
}

function mapCommissions(
  rows: any[] | null,
  labelById?: Map<string, string>
): PartnerCommission[] {
  return (rows ?? []).map((c: any) => ({
    id: c.id as string,
    projectName: (c.project_name as string) || null,
    clientName: (c.client_name as string) || null,
    amount: Number(c.referral_amount) || 0,
    status: (c.status as string) || "pending",
    dueDate: (c.due_date as string) || null,
    paidDate: (c.paid_date as string) || null,
    referredById: (c.referral_partner_id as string) || null,
    referredBy:
      labelById?.get(c.referral_partner_id as string) ?? null,
  }));
}

/**
 * Load the partner plus every lead they referred and their commissions.
 */
export async function getReferralBundle(): Promise<ReferralBundle> {
  const session = await resolveSessionPartner();
  if (!session) {
    return {
      partner: null,
      team: [],
      canAddTeam: false,
      leads: [],
      commissions: [],
      totals: { ...EMPTY_TOTALS },
    };
  }
  const { admin, partner, team, hasOwner } = session;
  const canAddTeam = !hasOwner && canSelfServeTeam(partner.email);
  const partnerIds = allowedPartnerIds(partner, team);
  const labelById = partnerLabelById(partner, team);

  // ── Referred leads (curated columns only) ────────────────────────────────
  const { data: projectRows } = await admin
    .from("projects")
    .select(
      "id, name, client_full_name, client_id, stage, created_at, referral_partner_note, referral_partner_id"
    )
    .in("referral_partner_id", partnerIds)
    .order("created_at", { ascending: false });

  const projects = projectRows ?? [];

  // Resolve client names not denormalised onto the project.
  const missingClientIds = Array.from(
    new Set(
      projects
        .filter((p: any) => !p.client_full_name && p.client_id)
        .map((p: any) => p.client_id as string)
    )
  );
  const clientNameById = new Map<string, string>();
  if (missingClientIds.length) {
    const { data: contacts } = await admin
      .from("contacts")
      .select("id, first_name, last_name")
      .in("id", missingClientIds);
    (contacts ?? []).forEach((c: any) => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      if (name) clientNameById.set(c.id as string, name);
    });
  }

  const leads: ReferredLead[] = projects.map((p: any) => ({
    id: p.id as string,
    projectName: (p.name as string) || null,
    clientName:
      (p.client_full_name as string) ||
      (p.client_id ? clientNameById.get(p.client_id as string) ?? null : null),
    referredOn: (p.created_at as string) || null,
    milestone: referralMilestone(p.stage as string | null),
    hasNote: !!(p.referral_partner_note && String(p.referral_partner_note).trim()),
    referredById: (p.referral_partner_id as string) || null,
    referredBy: labelById.get(p.referral_partner_id as string) ?? null,
  }));

  // ── Contact-only referred leads (no project yet) ─────────────────────────
  // A referred lead that hasn't become a project still needs to show so the
  // partner sees it landed. Skip contacts already represented as a project's
  // client (avoids duplicates). These read as "New Lead" (no pipeline stage).
  const projectClientIds = new Set(
    projects.map((p: any) => p.client_id as string).filter(Boolean)
  );
  const { data: contactRows } = await admin
    .from("contacts")
    .select("id, first_name, last_name, created_at, referral_partner_id")
    .in("referral_partner_id", partnerIds)
    .order("created_at", { ascending: false });
  for (const c of contactRows ?? []) {
    if (projectClientIds.has(c.id as string)) continue;
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    leads.push({
      id: c.id as string,
      projectName: null,
      clientName: name || null,
      referredOn: (c.created_at as string) || null,
      milestone: referralMilestone(null),
      hasNote: false,
      referredById: (c.referral_partner_id as string) || null,
      referredBy: labelById.get(c.referral_partner_id as string) ?? null,
    });
  }
  leads.sort((a, b) => (b.referredOn || "").localeCompare(a.referredOn || ""));

  // ── Commissions ──────────────────────────────────────────────────────────
  const { data: commissionRows } = await admin
    .from("referral_partner_commissions")
    .select(
      "id, project_name, client_name, referral_amount, status, due_date, paid_date, created_at, referral_partner_id"
    )
    .in("referral_partner_id", partnerIds)
    .order("created_at", { ascending: false });

  const commissions = mapCommissions(commissionRows, labelById);

  const totals = {
    leadCount: leads.length,
    // "Converted" = became a sale (contract signed onward, step 6+).
    convertedCount: leads.filter((l) => l.milestone.step >= 6).length,
    pending: commissions
      .filter((c) => c.status === "pending" || c.status === "due")
      .reduce((s, c) => s + c.amount, 0),
    paid: commissions
      .filter((c) => c.status === "paid")
      .reduce((s, c) => s + c.amount, 0),
  };

  return { partner, team, canAddTeam, leads, commissions, totals };
}

/**
 * Load a single referred lead plus its curated note and commissions — but ONLY
 * if the lead belongs to the session partner (or, for an organisation owner, a
 * team member). The lead id comes from the URL, so the referral_partner_id
 * filter is the ownership check that stops one partner reading another's lead.
 * Returns null when the lead doesn't exist or isn't theirs (so callers can 404
 * rather than leak existence).
 */
export async function getReferralLeadDetail(
  leadId: string
): Promise<ReferralLeadDetail | null> {
  const session = await resolveSessionPartner();
  if (!session) return null;
  const { admin, partner, team } = session;
  const partnerIds = allowedPartnerIds(partner, team);
  const labelById = partnerLabelById(partner, team);

  const { data: project } = await admin
    .from("projects")
    .select(
      "id, name, client_full_name, client_id, stage, created_at, referral_partner_note, referral_partner_id"
    )
    .eq("id", leadId)
    .in("referral_partner_id", partnerIds) // ownership gate
    .maybeSingle();

  // Contact-only referred lead (no project yet) — resolve from contacts, still
  // ownership-gated on referral_partner_id.
  if (!project) {
    const { data: contact } = await admin
      .from("contacts")
      .select("id, first_name, last_name, created_at, referral_partner_id")
      .eq("id", leadId)
      .in("referral_partner_id", partnerIds)
      .maybeSingle();
    if (!contact) return null;
    const c = contact as any;
    const lead: ReferredLead = {
      id: c.id as string,
      projectName: null,
      clientName: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null,
      referredOn: (c.created_at as string) || null,
      milestone: referralMilestone(null),
      hasNote: false,
      referredById: (c.referral_partner_id as string) || null,
      referredBy: labelById.get(c.referral_partner_id as string) ?? null,
    };
    return { partner, lead, note: null, commissions: [] };
  }

  const p = project as any;

  let clientName: string | null = (p.client_full_name as string) || null;
  if (!clientName && p.client_id) {
    const { data: contact } = await admin
      .from("contacts")
      .select("first_name, last_name")
      .eq("id", p.client_id)
      .maybeSingle();
    if (contact) {
      clientName =
        [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
        null;
    }
  }

  const note = p.referral_partner_note
    ? String(p.referral_partner_note).trim() || null
    : null;

  const lead: ReferredLead = {
    id: p.id as string,
    projectName: (p.name as string) || null,
    clientName,
    referredOn: (p.created_at as string) || null,
    milestone: referralMilestone(p.stage as string | null),
    hasNote: !!note,
    referredById: (p.referral_partner_id as string) || null,
    referredBy: labelById.get(p.referral_partner_id as string) ?? null,
  };

  const { data: commissionRows } = await admin
    .from("referral_partner_commissions")
    .select(
      "id, project_name, client_name, referral_amount, status, due_date, paid_date, created_at, referral_partner_id"
    )
    .in("referral_partner_id", partnerIds)
    .eq("project_id", leadId)
    .order("created_at", { ascending: false });

  return {
    partner,
    lead,
    note,
    commissions: mapCommissions(commissionRows, labelById),
  };
}
