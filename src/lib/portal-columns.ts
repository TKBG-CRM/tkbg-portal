/**
 * Column allow-lists for portal queries.
 *
 * Everything served to a portal client should be selected through these
 * constants — never `select("*")`. The projects + activities tables both
 * carry commission columns / rows that are strictly internal, and a
 * select-all leaks them into the JSON response (visible in the browser
 * DevTools network tab) even when the UI never renders them.
 *
 * Adding a new portal-visible column? Add it here. Adding a new internal
 * column? Leave it off here so it stays out of the portal payload by
 * default.
 */

export const PORTAL_PROJECT_COLUMNS = [
  "id",
  "name",
  "stage",
  "client_id",
  "co_client_ids",
  "builder_id",
  "broker_id",
  "sales_rep_id",
  "land_address",
  "land_lot_number",
  "land_street_name",
  "land_suburb",
  "land_state",
  "land_postcode",
  "land_estate_name",
  "land_estate_stage",
  "house_design",
  "facade",
  "internal_colour_scheme",
  "external_colour_scheme",
  "land_price",
  "build_price",
  "total_package_price",
  "initial_deposit_amount",
  "initial_deposit_paid_at",
  "initial_deposit_allocation",
  "initial_deposit_to_land_developer",
  "initial_deposit_to_tkbg",
  "initial_deposit_to_builder",
  "land_deposit_amount",
  "land_deposit_paid_at",
  "build_deposit_amount",
  "build_deposit_paid_at",
  "total_deposit_amount",
  "finance_expiry_date",
  "land_hold_expiry_date",
  "settlement_date",
  "contract_deadline",
  "handover_date",
  "estimated_land_title_date",
  "key_dates_completed",
  "stage_entered_date",
  "created_at",
  "updated_at",
].join(", ");

// Client-safe columns on the `contacts` table. The contact row carries a
// pile of internal-only fields — `financial_snapshot`, `notes`,
// `referral_partner_id`, `land_price` / `build_price` / `contract_value`,
// `budget_*`, `deposit_available`, `lead_status`, `sales_rep_id`, etc. — that
// must never reach a portal client. A `select("*")` on the client's own
// contact still ships all of those in the JSON payload (DevTools network tab)
// even if the UI only renders their name. Select through this list instead.
export const PORTAL_CONTACT_COLUMNS = [
  "id",
  "first_name",
  "middle_name",
  "last_name",
  "preferred_name",
  "email",
  "phone",
  "contact_type",
  "buyer_type",
  "address_line1",
  "address_line2",
  "suburb",
  "state",
  "postcode",
  "country",
  "company_name",
  "source",
  "tags",
  "is_registered",
  "created_at",
  "updated_at",
].join(", ");

export const PORTAL_ACTIVITY_COLUMNS =
  "id, project_id, type, title, description, metadata, created_at";

// Strict allowlist of activity TYPES that may surface in the portal
// feed. Everything else (tasks, notes, internal calls, "Auto-task:
// Order gift hamper", rep notes, commission rows, etc.) is invisible
// to the client by default.
export const PORTAL_ALLOWED_ACTIVITY_TYPES = [
  "stage_change",
  "meeting",
  "deposit_received",
  "email",
] as const;

// For stage_change rows, only these specific stage transitions are
// considered "client-friendly milestones" worth showing. Internal
// workflow stages (contract appointment booked, gift hamper sent,
// product review requested, contract requested from builder, etc.)
// stay hidden even though their activity row passes the type filter.
export const CLIENT_VISIBLE_STAGES = new Set<string>([
  "discovery_meeting_completed",
  "initial_deposit_received",
  "preliminary_works_agreement",
  "contract_signed",
  "bod_received",
  "formal_approval_received",
  "land_settled",
  "building_permit_received",
  "construction_base",
  "construction_frame",
  "construction_lockup",
  "construction_fixout",
  "construction_completion",
  "handover_completed",
]);

// Stage IDs that exist for portal-friendly framing — used by
// clientFacingStageLabel below to walk backwards from the project's
// current stage to the most-recent milestone the client knows about.
export const CLIENT_STAGE_ORDER = [
  "discovery_meeting_completed",
  "initial_deposit_received",
  "preliminary_works_agreement",
  "contract_signed",
  "bod_received",
  "formal_approval_received",
  "land_settled",
  "building_permit_received",
  "construction_base",
  "construction_frame",
  "construction_lockup",
  "construction_fixout",
  "construction_completion",
  "handover_completed",
] as const;

// Given the project's raw stage_id + order, return the friendly label
// for the most recent CLIENT-VISIBLE milestone it has reached. Avoids
// surfacing internal stage names like "Gift Hamper Sent" anywhere in
// the portal.
export function clientFacingStageLabel(
  currentStageId: string | null | undefined,
  currentStageOrder: number,
  stageOrderById: (id: string) => number
): string {
  for (let i = CLIENT_STAGE_ORDER.length - 1; i >= 0; i--) {
    const id = CLIENT_STAGE_ORDER[i];
    const order = stageOrderById(id);
    if (order > 0 && order <= currentStageOrder) {
      return CLIENT_STAGE_TITLES[id] || id;
    }
  }
  return "In progress";
}

// Friendly titles for the client-facing stage milestones. Falls back
// to whatever the activity row already has if a stage isn't mapped.
export const CLIENT_STAGE_TITLES: Record<string, string> = {
  discovery_meeting_completed: "Discovery meeting completed",
  initial_deposit_received: "Initial deposit received — thank you!",
  preliminary_works_agreement: "Preliminary Works Agreement signed",
  contract_signed: "Building contract signed",
  bod_received: "Balance of deposit received",
  formal_approval_received: "Finance formally approved",
  land_settled: "Land settled",
  building_permit_received: "Building permit received",
  construction_base: "Construction reached the base stage",
  construction_frame: "Construction reached the frame stage",
  construction_lockup: "Construction reached the lockup stage",
  construction_fixout: "Construction reached the fixout stage",
  construction_completion: "Construction completion reached",
  handover_completed: "Handover complete — welcome home!",
};

// Belt-and-braces text filter. Even after the type allowlist + stage
// filter, drop any row whose title/description names internal
// concepts a client should never see: commission, agency fees, tasks
// like "order gift hamper", rep-only notes, "Auto-task:" / "Auto-
// email:" prefixes (those are CRM automation receipts, not client
// updates).
export const PORTAL_HIDDEN_KEYWORDS = [
  "commission",
  "referral fee",
  "referral commission",
  "agency commission",
  "agent commission",
  "kickback",
  "auto-task:",
  "auto-email:",
  "gift hamper",
  "product review request",
  "internal",
  "rep notes",
];

// True if free text mentions an internal/commission topic a client should
// never see. Used to keep commission chatter out of surfaces that render raw
// staff-authored text verbatim (e.g. the email feed), the same way
// isClientVisibleActivity guards the activity timeline.
export function containsHiddenKeyword(
  ...parts: Array<string | null | undefined>
): boolean {
  const haystack = parts.map((p) => p || "").join(" ").toLowerCase();
  return PORTAL_HIDDEN_KEYWORDS.some((kw) => haystack.includes(kw));
}

export function isClientVisibleActivity(activity: {
  type?: string | null;
  title?: string | null;
  description?: string | null;
  metadata?: any;
}): boolean {
  if (!activity.type) return false;
  if (
    !PORTAL_ALLOWED_ACTIVITY_TYPES.includes(
      activity.type as (typeof PORTAL_ALLOWED_ACTIVITY_TYPES)[number]
    )
  ) {
    return false;
  }
  if (activity.type === "stage_change") {
    const ns = (activity.metadata as any)?.new_stage as string | undefined;
    if (!ns || !CLIENT_VISIBLE_STAGES.has(ns)) return false;
  }
  const haystack = `${activity.title || ""} ${activity.description || ""}`.toLowerCase();
  if (PORTAL_HIDDEN_KEYWORDS.some((kw) => haystack.includes(kw))) return false;
  return true;
}

// Apply a friendly title to stage_change rows; pass other rows through
// unchanged. Used after isClientVisibleActivity filtering.
export function rewriteActivityForClient<T extends {
  type?: string | null;
  title?: string | null;
  metadata?: any;
}>(activity: T): T {
  if (activity.type !== "stage_change") return activity;
  const ns = (activity.metadata as any)?.new_stage as string | undefined;
  if (ns && CLIENT_STAGE_TITLES[ns]) {
    return { ...activity, title: CLIENT_STAGE_TITLES[ns] };
  }
  return activity;
}

// ─── Legacy compatibility exports ──────────────────────────────────────
// Older imports still use these names. Keep them around so existing
// callers don't break on upgrade — they alias the new allowlist.
export const PORTAL_BLOCKED_ACTIVITY_TYPES: Set<string> = new Set([
  "commission",
  "referral_commission",
  "task",
  "note",
  "call",
]);

export function isCommissionActivity(activity: {
  type?: string | null;
  title?: string | null;
  description?: string | null;
}): boolean {
  // Backwards-compatible: anything the new visibility check would
  // drop is treated as commission/internal for legacy callers.
  return !isClientVisibleActivity(activity as any);
}

// Final defensive scrubber. Wrap any query result with this before
// returning it from a portal page. It deletes any object key that
// looks like a commission / referral-fee / agent-commission field
// regardless of where it came from, so a future select("*") or a
// new internal column that slips through still can't leak commission
// detail to the client. Cheap O(n) walk over the response.
const COMMISSION_KEY_PATTERN =
  /^(commission|referral_commission|referral_amount|agent_commission)/i;

export function scrubCommission<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => scrubCommission(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (COMMISSION_KEY_PATTERN.test(k)) continue;
      out[k] = scrubCommission(v);
    }
    return out as T;
  }
  return value;
}
