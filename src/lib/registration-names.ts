/**
 * Middle-name capture rules for portal self-registration.
 *
 * Contract, nomination and prelim-agreement documents need each purchaser's
 * FULL legal name, and an optional middle-name field simply gets skipped — so
 * the field is now settled deliberately: a purchaser either enters a middle
 * name or explicitly confirms they don't have one. Pure, so the step gate is
 * unit tested.
 */

export type PurchaserNameEntry = {
  first_name: string;
  middle_name: string;
  /** The explicit "I don't have a middle name" confirmation. */
  no_middle_name?: boolean;
  last_name: string;
};

/** A purchaser's middle name is settled when typed OR explicitly declined. */
export function middleNameSettled(p: {
  middle_name: string;
  no_middle_name?: boolean;
}): boolean {
  return !!p.no_middle_name || p.middle_name.trim().length > 0;
}

/**
 * Gate for the Purchaser Details step. The primary needs name + contact
 * details and a settled middle name; every additional purchaser the client
 * has actually started naming needs a settled middle name too (rows left
 * fully blank are dropped at submit, so they don't block).
 */
export function purchaserStepComplete(args: {
  primary: PurchaserNameEntry & { email: string; mobile: string };
  additional: PurchaserNameEntry[];
}): boolean {
  const { primary, additional } = args;
  if (!primary.first_name.trim() || !primary.last_name.trim()) return false;
  if (!primary.email.trim() || !primary.mobile.trim()) return false;
  if (!middleNameSettled(primary)) return false;
  for (const p of additional) {
    if (!p.first_name.trim() && !p.last_name.trim()) continue;
    if (!middleNameSettled(p)) return false;
  }
  return true;
}
