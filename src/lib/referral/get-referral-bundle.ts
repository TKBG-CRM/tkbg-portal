import { createClient } from "@/lib/supabase/server";
import {
  createClient as createServiceRoleClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  referralMilestone,
  type ReferralMilestone,
} from "./referral-status";

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
};

export type PartnerCommission = {
  id: string;
  projectName: string | null;
  clientName: string | null;
  amount: number;
  status: string; // pending | due | paid | cancelled
  dueDate: string | null;
  paidDate: string | null;
};

export type ReferralBundle = {
  partner: ReferralPartner | null;
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
    .select("id, name, contact_name, email")
    .eq("portal_access", true)
    .ilike("email", user.email)
    .limit(1);

  const partner = (partners?.[0] as ReferralPartner | undefined) ?? null;
  if (!partner) return null;
  return { admin, partner };
}

function mapCommissions(rows: any[] | null): PartnerCommission[] {
  return (rows ?? []).map((c: any) => ({
    id: c.id as string,
    projectName: (c.project_name as string) || null,
    clientName: (c.client_name as string) || null,
    amount: Number(c.referral_amount) || 0,
    status: (c.status as string) || "pending",
    dueDate: (c.due_date as string) || null,
    paidDate: (c.paid_date as string) || null,
  }));
}

/**
 * Load the partner plus every lead they referred and their commissions.
 */
export async function getReferralBundle(): Promise<ReferralBundle> {
  const session = await resolveSessionPartner();
  if (!session) {
    return { partner: null, leads: [], commissions: [], totals: { ...EMPTY_TOTALS } };
  }
  const { admin, partner } = session;

  // ── Referred leads (curated columns only) ────────────────────────────────
  const { data: projectRows } = await admin
    .from("projects")
    .select("id, name, client_full_name, client_id, stage, created_at, referral_partner_note")
    .eq("referral_partner_id", partner.id)
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
  }));

  // ── Commissions ──────────────────────────────────────────────────────────
  const { data: commissionRows } = await admin
    .from("referral_partner_commissions")
    .select(
      "id, project_name, client_name, referral_amount, status, due_date, paid_date, created_at"
    )
    .eq("referral_partner_id", partner.id)
    .order("created_at", { ascending: false });

  const commissions = mapCommissions(commissionRows);

  const totals = {
    leadCount: leads.length,
    convertedCount: leads.filter((l) => l.milestone.step >= 3).length,
    pending: commissions
      .filter((c) => c.status === "pending" || c.status === "due")
      .reduce((s, c) => s + c.amount, 0),
    paid: commissions
      .filter((c) => c.status === "paid")
      .reduce((s, c) => s + c.amount, 0),
  };

  return { partner, leads, commissions, totals };
}

/**
 * Load a single referred lead plus its curated note and commissions — but ONLY
 * if the lead belongs to the session partner. The lead id comes from the URL,
 * so the `.eq("referral_partner_id", partner.id)` filter is the ownership check
 * that stops one partner reading another's lead. Returns null when the lead
 * doesn't exist or isn't theirs (so callers can 404 rather than leak existence).
 */
export async function getReferralLeadDetail(
  leadId: string
): Promise<ReferralLeadDetail | null> {
  const session = await resolveSessionPartner();
  if (!session) return null;
  const { admin, partner } = session;

  const { data: project } = await admin
    .from("projects")
    .select("id, name, client_full_name, client_id, stage, created_at, referral_partner_note")
    .eq("id", leadId)
    .eq("referral_partner_id", partner.id) // ownership gate
    .maybeSingle();

  if (!project) return null;
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
  };

  const { data: commissionRows } = await admin
    .from("referral_partner_commissions")
    .select(
      "id, project_name, client_name, referral_amount, status, due_date, paid_date, created_at"
    )
    .eq("referral_partner_id", partner.id)
    .eq("project_id", leadId)
    .order("created_at", { ascending: false });

  return { partner, lead, note, commissions: mapCommissions(commissionRows) };
}
