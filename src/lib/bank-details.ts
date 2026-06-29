/**
 * Standard Turnkey deposit bank account, surfaced in the portal so a client
 * can pay their initial deposit by EFT.
 *
 * This is the company-level Turnkey CBA account — it is not client-specific
 * (only the payment *reference* is), so it is safe to show to any
 * authenticated portal client, including a newly-registered one who does not
 * yet have a project allocated.
 *
 * Account details are fixed by the business:
 *   Bank: CBA · Account Name: Turnkey Building Group · BSB: 067 873 · ACC: 19502151
 *   Reference: "Lot <number> <Last name>" (auto-filled per client)
 */

export interface BankAccountField {
  label: string;
  value: string;
  /** Render the value monospaced (BSB / account numbers) for legibility. */
  mono?: boolean;
}

export interface BankAccount {
  title: string;
  fields: BankAccountField[];
}

export interface BuildBankAccountOpts {
  lotNumber?: string | null;
  lastName?: string | null;
  /** Omitted (no "Amount" row) when null — e.g. before a project exists. */
  amount?: number | null;
}

function fmtAud(value: number | null | undefined): string | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `$${n.toLocaleString("en-AU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Compose the payment reference: "Lot <number> <Last name>". Missing parts are
 * dropped; when neither is known a placeholder tells the client to confirm it.
 */
export function buildDepositReference(opts: {
  lotNumber?: string | null;
  lastName?: string | null;
}): string {
  const lot = (opts.lotNumber || "").toString().trim();
  const last = (opts.lastName || "").toString().trim();
  const parts = [lot ? `Lot ${lot}` : "", last].map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : "(confirm with your sales rep)";
}

/**
 * The Turnkey deposit account, with the reference auto-filled from the
 * client's lot number + last name. Returned as a single-element array so
 * callers can render a uniform list of accounts.
 */
export function buildDepositBankAccounts(
  opts: BuildBankAccountOpts = {}
): BankAccount[] {
  const reference = buildDepositReference(opts);
  const amount = fmtAud(opts.amount);

  return [
    {
      title: "Turnkey Building Group",
      fields: [
        { label: "Bank", value: "CBA" },
        { label: "Account name", value: "Turnkey Building Group" },
        { label: "BSB", value: "067 873", mono: true },
        { label: "ACC", value: "19502151", mono: true },
        ...(amount ? [{ label: "Amount", value: amount }] : []),
        { label: "Reference", value: reference },
      ],
    },
  ];
}
