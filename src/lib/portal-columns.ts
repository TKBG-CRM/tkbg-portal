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

export const PORTAL_ACTIVITY_COLUMNS =
  "id, project_id, type, title, description, created_at";

// Activity types that must never appear in the portal feed.
export const PORTAL_BLOCKED_ACTIVITY_TYPES = new Set([
  "commission",
  "referral_commission",
]);

// Belt-and-braces filter: even if an activity slips through with a
// non-commission type, drop it when its title or description names
// commission detail.
export function isCommissionActivity(activity: {
  type?: string | null;
  title?: string | null;
  description?: string | null;
}): boolean {
  if (activity.type && PORTAL_BLOCKED_ACTIVITY_TYPES.has(activity.type)) {
    return true;
  }
  const haystack = `${activity.title || ""} ${activity.description || ""}`.toLowerCase();
  return haystack.includes("commission");
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
