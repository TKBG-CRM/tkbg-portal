import type {
  PartnerCommission,
  ReferralPartner,
  ReferredLead,
} from "./get-referral-bundle";

/**
 * Referral partner organisations ("teams").
 *
 * A partner row may point at another partner via `parent_partner_id` — the
 * child is a staff member of the parent's organisation (e.g. a Finance Family
 * broker under the owner's partner record). Team membership only ever widens
 * what the OWNER sees: staff logins resolve to their own partner row with no
 * children, so they see exactly their own referrals, same as a solo partner.
 *
 * These helpers are pure so the owner-view maths is unit tested.
 */

export type TeamMember = {
  id: string;
  name: string | null;
  contact_name: string | null;
};

export type MemberSummary = {
  id: string;
  label: string;
  isOwner: boolean;
  leadCount: number;
  convertedCount: number;
  pending: number;
  paid: number;
};

/** Display name for a partner row — person first, then business name. */
export function partnerLabel(
  p: { contact_name?: string | null; name?: string | null } | null | undefined
): string {
  return (p?.contact_name || p?.name || "Partner").trim() || "Partner";
}

/** The partner ids a session may read: the signed-in partner plus their team. */
export function allowedPartnerIds(
  partner: { id: string },
  team: TeamMember[]
): string[] {
  return [partner.id, ...team.map((t) => t.id)];
}

/** Map of partner id → display label, for tagging rows with "referred by". */
export function partnerLabelById(
  partner: ReferralPartner,
  team: TeamMember[]
): Map<string, string> {
  const map = new Map<string, string>();
  map.set(partner.id, partnerLabel(partner));
  for (const t of team) map.set(t.id, partnerLabel(t));
  return map;
}

/**
 * Per-member rollup for the owner's organisation view: every member (owner
 * first, then team in given order) with their lead / conversion / commission
 * numbers. "Converted" mirrors the bundle's definition (milestone step >= 6).
 */
export function memberSummaries(
  leads: ReferredLead[],
  commissions: PartnerCommission[],
  partner: ReferralPartner,
  team: TeamMember[]
): MemberSummary[] {
  const members: MemberSummary[] = [partner, ...team].map((m, i) => ({
    id: m.id,
    label: partnerLabel(m),
    isOwner: i === 0,
    leadCount: 0,
    convertedCount: 0,
    pending: 0,
    paid: 0,
  }));
  const byId = new Map(members.map((m) => [m.id, m]));

  for (const lead of leads) {
    const m = lead.referredById ? byId.get(lead.referredById) : undefined;
    if (!m) continue;
    m.leadCount += 1;
    if (lead.milestone.step >= 6) m.convertedCount += 1;
  }
  for (const c of commissions) {
    const m = c.referredById ? byId.get(c.referredById) : undefined;
    if (!m) continue;
    if (c.status === "paid") m.paid += c.amount;
    else if (c.status === "pending" || c.status === "due") m.pending += c.amount;
  }
  return members;
}
