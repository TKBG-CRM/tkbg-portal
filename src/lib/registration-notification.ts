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
}): { title: string; message: string } {
  const who = ctx.clientName || "Client";
  const forProject = ctx.projectName ? ` for ${ctx.projectName}` : "";
  if (ctx.depositPaid) {
    return {
      title: `${who} registered and paid initial deposit`,
      message:
        `${who} has completed their portal registration${forProject}. ` +
        `Initial deposit has been paid and purchaser details + ID + payment confirmation are on the contact record.`,
    };
  }
  return {
    title: `${who} registered — initial deposit pending`,
    message:
      `${who} has completed their portal registration${forProject}. ` +
      `Purchaser details + ID are on the contact record. No payment remittance was attached — the initial deposit is not yet confirmed, so follow up to confirm payment.`,
  };
}
