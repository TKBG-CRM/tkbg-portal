/**
 * Assemble the purchaser list captured during portal self-registration.
 *
 * A joint purchase can name multiple purchasers (a primary registrant plus any
 * number of additional purchasers), and each purchaser now uploads their OWN
 * ID document(s). This helper turns the raw form/API payload into:
 *
 *   - `purchasers`: the array we persist to `contacts.purchasers` (JSONB).
 *     Each entry carries its own `id_document_urls`, so downstream code can
 *     label "Purchaser 2 ID — Jane Doe" against the RIGHT person instead of
 *     guessing by upload order.
 *   - `flatIdPaths`: every ID path across all purchasers, primary first,
 *     de-duplicated — kept for the legacy flat `contacts.id_document_urls`
 *     column and the stage-requirement "client ID attached" check.
 *
 * Pure (no network / no storage), so the mapping rule is unit tested. Paths
 * are filtered to the registration token's own storage prefix so a client
 * can't attribute a file from another client's folder to a purchaser.
 */

export type PurchaserInput = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  // Legacy single-field name. Used as a fallback when the discrete parts above
  // are absent, so older callers/tests keep working.
  full_legal_name?: string | null;
  email?: string | null;
  mobile?: string | null;
  idDocumentPaths?: unknown;
};

export type AssembledPurchaser = {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  full_legal_name: string;
  email: string | null;
  mobile: string | null;
  primary: boolean;
  id_document_urls: string[];
};

/**
 * Compose a single legal name from discrete parts. Trims each part, drops an
 * empty middle name, and falls back to the legacy `full_legal_name` when no
 * discrete parts were supplied.
 */
function composeLegalName(input: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_legal_name?: string | null;
}): {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  full_legal_name: string;
} {
  const first = String(input.first_name || "").trim();
  const middle = String(input.middle_name || "").trim();
  const last = String(input.last_name || "").trim();

  const composed = [first, middle, last].filter(Boolean).join(" ");
  const full_legal_name = composed || String(input.full_legal_name || "").trim();

  return {
    first_name: first || null,
    middle_name: middle || null,
    last_name: last || null,
    full_legal_name,
  };
}

function safePaths(paths: unknown, prefix: string): string[] {
  if (!Array.isArray(paths)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (typeof p !== "string") continue;
    if (!p.startsWith(prefix)) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

export function assemblePurchasers(args: {
  primary: PurchaserInput;
  additional: unknown;
  safePrefix: string;
}): { purchasers: AssembledPurchaser[]; flatIdPaths: string[] } {
  const primary: AssembledPurchaser = {
    ...composeLegalName(args.primary),
    email: args.primary.email || null,
    mobile: args.primary.mobile || null,
    primary: true,
    id_document_urls: safePaths(args.primary.idDocumentPaths, args.safePrefix),
  };

  const additional: AssembledPurchaser[] = (
    Array.isArray(args.additional) ? args.additional : []
  )
    .map((p: any) => ({
      ...composeLegalName(p ?? {}),
      email: p?.email || null,
      mobile: p?.mobile || null,
      primary: false,
      id_document_urls: safePaths(p?.idDocumentPaths, args.safePrefix),
    }))
    // Keep only purchasers that resolved to a non-empty name.
    .filter((p) => p.full_legal_name.length > 0);

  const purchasers = [primary, ...additional];

  // Flat list across all purchasers, primary first, de-duplicated.
  const seen = new Set<string>();
  const flatIdPaths: string[] = [];
  for (const p of purchasers) {
    for (const path of p.id_document_urls) {
      if (seen.has(path)) continue;
      seen.add(path);
      flatIdPaths.push(path);
    }
  }

  return { purchasers, flatIdPaths };
}

/**
 * The additional (non primary) purchasers that deserve their OWN contacts
 * row, so staff pickers (Additional Clients on the project) can find them —
 * previously they lived only inside the primary contact's purchasers JSON.
 * Skips entries with neither a usable name nor an email.
 */
export function extraPurchaserContacts(
  purchasers: AssembledPurchaser[]
): Array<{
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}> {
  return purchasers
    .filter((p) => !p.primary)
    .filter((p) => (p.full_legal_name || "").trim() || (p.email || "").trim())
    .map((p) => ({
      first_name: p.first_name,
      middle_name: p.middle_name,
      last_name: p.last_name,
      email: (p.email || "").trim() || null,
      phone: (p.mobile || "").trim() || null,
    }));
}
