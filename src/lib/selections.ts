// Facade & Colour Selection — portal side pure logic.
// The /select/[token] page and its confirm API validate everything through
// these helpers so the rules are unit tested: which requests are still open,
// and which picks are legal for a given request.

export type SelectionRequestStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "completed"
  | "expired"
  | "cancelled";

export interface SelectionRequestRow {
  id: string;
  project_id: string;
  status: SelectionRequestStatus;
  include_facades: boolean;
  include_external_colours: boolean;
  include_internal_colours: boolean;
  custom_message: string | null;
  facade_option_ids: string[];
  external_colour_ids: string[];
  internal_colour_ids: string[];
  selected_facade_id: string | null;
  selected_external_id: string | null;
  selected_internal_id: string | null;
  completed_at: string | null;
  expires_at: string | null;
  viewed_at: string | null;
}

/**
 * Live state of a request: a request past expires_at is closed even if the
 * CRM's expiry cron has not swept it yet.
 */
export function selectionOpenState(
  r: Pick<SelectionRequestRow, "status" | "expires_at" | "completed_at">,
  now: Date
): "open" | "completed" | "closed" {
  if (r.status === "completed" || r.completed_at) return "completed";
  if (r.status === "cancelled" || r.status === "expired" || r.status === "draft") return "closed";
  if (r.expires_at && new Date(r.expires_at).getTime() < now.getTime()) return "closed";
  return "open";
}

export interface SelectionChoice {
  facade_id?: string | null;
  external_id?: string | null;
  internal_id?: string | null;
}

/**
 * A pick is valid when every included section has a choice and every choice
 * comes from the ids the staff member actually sent. A token can never write
 * an option that was not offered on ITS request.
 */
export function validateSelectionChoice(
  r: Pick<
    SelectionRequestRow,
    | "include_facades"
    | "include_external_colours"
    | "include_internal_colours"
    | "facade_option_ids"
    | "external_colour_ids"
    | "internal_colour_ids"
  >,
  choice: SelectionChoice
): { ok: true } | { ok: false; error: string } {
  const facadeRequired = r.include_facades && r.facade_option_ids.length > 0;
  if (facadeRequired) {
    if (!choice.facade_id) return { ok: false, error: "Choose a facade before confirming." };
    if (!r.facade_option_ids.includes(choice.facade_id)) {
      return { ok: false, error: "That facade is not part of this selection." };
    }
  } else if (choice.facade_id) {
    return { ok: false, error: "That facade is not part of this selection." };
  }

  const externalRequired = r.include_external_colours && r.external_colour_ids.length > 0;
  if (externalRequired) {
    if (!choice.external_id)
      return { ok: false, error: "Choose an external colour scheme before confirming." };
    if (!r.external_colour_ids.includes(choice.external_id)) {
      return { ok: false, error: "That external colour scheme is not part of this selection." };
    }
  } else if (choice.external_id) {
    return { ok: false, error: "That external colour scheme is not part of this selection." };
  }

  const internalRequired = r.include_internal_colours && r.internal_colour_ids.length > 0;
  if (internalRequired) {
    if (!choice.internal_id)
      return { ok: false, error: "Choose an internal colour scheme before confirming." };
    if (!r.internal_colour_ids.includes(choice.internal_id)) {
      return { ok: false, error: "That internal colour scheme is not part of this selection." };
    }
  } else if (choice.internal_id) {
    return { ok: false, error: "That internal colour scheme is not part of this selection." };
  }

  return { ok: true };
}

/** Activity wording, e.g. "Client selected facade: Astoria; External: Dune". */
export function describeSelection(parts: {
  facade?: string | null;
  external?: string | null;
  internal?: string | null;
}): string {
  const bits: string[] = [];
  if (parts.facade) bits.push(`facade: ${parts.facade}`);
  if (parts.external) bits.push(`External: ${parts.external}`);
  if (parts.internal) bits.push(`Internal: ${parts.internal}`);
  return `Client selected ${bits.join("; ")}`;
}

/** Next business day (Mon to Fri) after `from`, as yyyy-mm-dd. */
export function nextBusinessDay(from: Date): string {
  const d = new Date(from.getTime());
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toISOString().slice(0, 10);
}
