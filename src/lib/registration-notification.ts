/**
 * Staff notification wording for a completed portal registration.
 *
 * Registration and payment are decoupled — the registration link is often sent
 * so a client can register and pay afterwards — so the wording differs by
 * whether the client attached a payment remittance: "registered and paid" vs
 * "registered — deposit pending" with a prompt to follow up. Pure so it can be
 * unit tested (Next route files may only export HTTP handlers).
 */
export function composeRegistrationNotification(ctx: {
  clientName: string | null;
  projectName: string | null;
  depositPaid: boolean;
  /** Whether the client attached at least one ID document. */
  idProvided?: boolean;
}): { title: string; message: string } {
  const who = ctx.clientName || "Client";
  const forProject = ctx.projectName ? ` for ${ctx.projectName}` : "";
  // The client can complete registration without an ID by ticking "I'll send it
  // later" — call that out loudly so staff know to chase it.
  const idProvided = ctx.idProvided !== false;
  const idNote = idProvided
    ? ""
    : ` ⚠️ No ID was attached — the client opted to send it later, so follow up to collect their photo ID.`;
  if (ctx.depositPaid) {
    return {
      title: idProvided
        ? `${who} registered and paid initial deposit`
        : `${who} registered and paid — ID still needed`,
      message:
        `${who} has completed their portal registration${forProject}. ` +
        `Initial deposit has been paid${
          idProvided
            ? " and purchaser details + ID + payment confirmation are on the contact record."
            : " and payment confirmation is on the contact record."
        }${idNote}`,
    };
  }
  return {
    title: idProvided
      ? `${who} registered — initial deposit pending`
      : `${who} registered — deposit & ID pending`,
    message:
      `${who} has completed their portal registration${forProject}. ` +
      `Purchaser details${idProvided ? " + ID are" : " are"} on the contact record. ` +
      `No payment remittance was attached — the initial deposit is not yet confirmed, so follow up to confirm payment.${idNote}`,
  };
}
