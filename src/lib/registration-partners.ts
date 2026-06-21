import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Broker / conveyancer details a client can optionally provide during portal
 * registration. On submit these are turned into CRM contacts (contact_type
 * "broker" / "conveyancer") and linked onto the project's broker_id /
 * conveyancer_id so sales staff don't have to enter them by hand.
 *
 * The portal and CRM share one Supabase database, so writing the contacts +
 * the project FKs here is all that's needed for the partners to appear on the
 * project in the CRM — no separate CRM call required.
 */

export type PartnerKind = "broker" | "conveyancer";

export interface PartnerInput {
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface NormalizedPartner {
  first_name: string;
  last_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * Trim + lower-case the email and decide whether the section is actually filled
 * in. Returns null when nothing usable was provided (so the caller skips it).
 * contacts.first_name / last_name are NOT NULL, so first_name always falls back
 * through company → email so a real row can be written.
 */
export function normalizePartner(
  input: PartnerInput | null | undefined
): NormalizedPartner | null {
  if (!input || typeof input !== "object") return null;
  const first = (input.first_name || "").trim();
  const last = (input.last_name || "").trim();
  const company = (input.company_name || "").trim();
  const email = (input.email || "").trim().toLowerCase();
  const phone = (input.phone || "").trim();

  // Need at least one identifying field, otherwise treat as "not provided".
  if (!first && !last && !company && !email) return null;

  return {
    first_name: first || company || email || last,
    last_name: last,
    company_name: company || null,
    email: email || null,
    phone: phone || null,
  };
}

/**
 * Find an existing contact of this kind by email (case-insensitive) or create a
 * new one. Dedup is scoped to the contact_type so we never reuse, say, the
 * client's own contact as their broker. Returns the contact id + whether it was
 * freshly created.
 */
export async function findOrCreatePartnerContact(
  admin: SupabaseClient,
  kind: PartnerKind,
  partner: NormalizedPartner,
  salesRepId: string | null
): Promise<{ id: string; created: boolean }> {
  if (partner.email) {
    const { data: existing } = await admin
      .from("contacts")
      .select("id")
      .eq("contact_type", kind)
      .ilike("email", partner.email)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return { id: existing.id as string, created: false };
  }

  const { data, error } = await admin
    .from("contacts")
    .insert({
      contact_type: kind,
      first_name: partner.first_name,
      last_name: partner.last_name,
      company_name: partner.company_name,
      email: partner.email,
      phone: partner.phone,
      sales_rep_id: salesRepId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, created: true };
}

export interface LinkRegistrationPartnersArgs {
  projectId: string;
  salesRepId: string | null;
  /** Current broker_id on the project — if set, we don't overwrite it. */
  existingBrokerId: string | null;
  /** Current conveyancer_id on the project — if set, we don't overwrite it. */
  existingConveyancerId: string | null;
  broker: PartnerInput | null | undefined;
  conveyancer: PartnerInput | null | undefined;
}

export interface PartnerLinkResult {
  contactId: string;
  created: boolean;
}

export interface LinkRegistrationPartnersResult {
  broker: PartnerLinkResult | null;
  conveyancer: PartnerLinkResult | null;
}

/**
 * Create/reuse the broker + conveyancer contacts a client supplied at signup
 * and link them onto the project — but only fill GAPS: if staff already linked
 * a broker/conveyancer, we leave it alone (avoids clobbering / double handling).
 * Logs an activity per link. The caller should treat this as best-effort and
 * not fail the registration if it throws.
 */
export async function linkRegistrationPartners(
  admin: SupabaseClient,
  args: LinkRegistrationPartnersArgs
): Promise<LinkRegistrationPartnersResult> {
  const result: LinkRegistrationPartnersResult = {
    broker: null,
    conveyancer: null,
  };
  const projectPatch: Record<string, string> = {};

  const kinds: Array<{
    kind: PartnerKind;
    input: PartnerInput | null | undefined;
    existingId: string | null;
  }> = [
    { kind: "broker", input: args.broker, existingId: args.existingBrokerId },
    {
      kind: "conveyancer",
      input: args.conveyancer,
      existingId: args.existingConveyancerId,
    },
  ];

  for (const { kind, input, existingId } of kinds) {
    const normalized = normalizePartner(input);
    if (!normalized) continue;
    // Don't overwrite a link the sales team already set.
    if (existingId) continue;
    const { id, created } = await findOrCreatePartnerContact(
      admin,
      kind,
      normalized,
      args.salesRepId
    );
    if (!id) continue;
    projectPatch[`${kind}_id`] = id;
    result[kind] = { contactId: id, created };
  }

  if (Object.keys(projectPatch).length === 0) return result;

  await admin.from("projects").update(projectPatch).eq("id", args.projectId);

  // Activity per linked partner so the timeline records where it came from.
  const activities: Array<Record<string, unknown>> = [];
  for (const { kind } of kinds) {
    const r = result[kind];
    if (!r) continue;
    const label = kind === "broker" ? "Broker" : "Conveyancer";
    activities.push({
      project_id: args.projectId,
      contact_id: r.contactId,
      user_id: args.salesRepId,
      type: `${kind}_linked`,
      title: `${label} added from portal sign-up`,
      description: `The client provided their ${kind} details during portal registration; ${
        r.created ? "a new contact was created and " : ""
      }linked to this project automatically.`,
      metadata: {
        source: "client_portal_registration",
        [`${kind}_id`]: r.contactId,
        created_contact: r.created,
      },
    });
  }
  if (activities.length > 0) {
    await admin.from("activities").insert(activities);
  }

  return result;
}
