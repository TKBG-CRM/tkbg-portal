/**
 * Self-serve team building for referral partner organisations.
 *
 * An organisation owner (e.g. Tony at Finance Family) can add his own staff
 * to his team from the portal — WITHOUT waiting for Turnkey staff — provided
 * the new member's email is on the SAME business domain as his own login
 * email. The domain match is the trust boundary: it proves the person being
 * added belongs to the owner's business, and it's why free mailbox domains
 * (gmail, outlook, …) can never self-serve — a shared consumer domain proves
 * nothing about who works for whom.
 *
 * Pure (no IO) so the gate is unit tested; the API route re-runs these checks
 * server-side and adds the DB-dependent ones (duplicate email, team cap).
 */

export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.com.au",
  "hotmail.com",
  "hotmail.com.au",
  "live.com",
  "live.com.au",
  "msn.com",
  "yahoo.com",
  "yahoo.com.au",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "bigpond.com",
  "bigpond.net.au",
  "optusnet.com.au",
  "iinet.net.au",
  "tpg.com.au",
]);

/** Max self-served team members per organisation — an abuse backstop, not a
 * product limit. Turnkey staff can always add more via the CRM. */
export const MAX_SELF_SERVE_TEAM = 25;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailDomain(email: string | null | undefined): string | null {
  const at = (email || "").trim().toLowerCase().split("@");
  if (at.length !== 2 || !at[1]) return null;
  return at[1];
}

/**
 * Whether this partner may self-serve team members at all: they need a
 * business (non-free) email domain to anchor the domain-match check.
 */
export function canSelfServeTeam(ownerEmail: string | null | undefined): boolean {
  const domain = emailDomain(ownerEmail);
  return !!domain && !FREE_EMAIL_DOMAINS.has(domain);
}

export type TeamMemberValidation =
  | { ok: true; name: string; email: string }
  | { ok: false; error: string };

/**
 * Validate a self-served team member against the owner's login email.
 * Returns the trimmed/normalised values on success.
 */
export function validateTeamMember(
  ownerEmail: string | null | undefined,
  rawName: unknown,
  rawEmail: unknown
): TeamMemberValidation {
  const ownerDomain = emailDomain(ownerEmail);
  if (!ownerDomain || FREE_EMAIL_DOMAINS.has(ownerDomain)) {
    return {
      ok: false,
      error:
        "Team members can only be added from a business email account. Ask Turnkey to set up your team.",
    };
  }

  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name.length < 2) {
    return { ok: false, error: "Please enter the team member's name." };
  }

  const email =
    typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (email === (ownerEmail || "").trim().toLowerCase()) {
    return { ok: false, error: "That's your own email address." };
  }
  if (emailDomain(email) !== ownerDomain) {
    return {
      ok: false,
      error: `Team members must use your business email domain (@${ownerDomain}).`,
    };
  }
  return { ok: true, name, email };
}
