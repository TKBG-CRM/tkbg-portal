import { STAGE_CONFIG } from "@/lib/stages";

/**
 * Referral-safe milestone mapping — pure, no server/db imports so it can be
 * unit-tested and reused. The referral partner sees "where their referral is up
 * to", NOT the granular internal pipeline stage id or any internal note.
 *
 * Keyed off the stage's *phase* (not raw order) so it's immune to the
 * order-collisions in STAGE_CONFIG (e.g. initial_deposit_received order 11 vs
 * out_of_market / preliminary_works_agreement order 12).
 */
export type ReferralMilestone = {
  key: string;
  label: string;
  step: number; // 0 = not proceeding, 1..6 along the journey
  tone: "neutral" | "gold" | "green" | "red";
};

export const TOTAL_STEPS = 6;

export function referralMilestone(stageId: string | null): ReferralMilestone {
  if (!stageId) {
    return { key: "new", label: "New Lead", step: 1, tone: "neutral" };
  }
  if (stageId === "out_of_market") {
    return { key: "not_proceeding", label: "Not Proceeding", step: 0, tone: "red" };
  }
  // The Royston-only step between deposit and contract request. It's a real
  // value in the shared DB but isn't in this app's STAGE_CONFIG copy, so map it
  // explicitly rather than fall through to "New Lead".
  if (stageId === "preliminary_works_agreement") {
    return { key: "deposit_paid", label: "Deposit Paid", step: 2, tone: "gold" };
  }
  const cfg = STAGE_CONFIG[stageId];
  const phase = cfg?.phase ?? "new_lead";

  if (phase === "completed") {
    return { key: "completed", label: "Completed", step: 6, tone: "green" };
  }
  if (phase === "construction") {
    return { key: "construction", label: "In Construction", step: 5, tone: "green" };
  }
  if (phase === "pre_site") {
    return { key: "pre_site", label: "Pre-Site", step: 4, tone: "gold" };
  }
  if (phase === "new_sale") {
    const order = cfg?.order ?? 0;
    const contractSignedOrder = STAGE_CONFIG["contract_signed"]?.order ?? 19;
    if (order >= contractSignedOrder) {
      return { key: "contract_signed", label: "Contract Signed", step: 3, tone: "green" };
    }
    return { key: "deposit_paid", label: "Deposit Paid", step: 2, tone: "gold" };
  }
  // new_lead (and anything unmapped) → still an open lead.
  return { key: "new", label: "New Lead", step: 1, tone: "neutral" };
}

export function milestoneProgressPct(step: number): number {
  if (step <= 0) return 0;
  return Math.round((step / TOTAL_STEPS) * 100);
}

/** The ordered partner-facing journey, used to render the lead timeline. */
export const MILESTONE_STEPS: { step: number; label: string }[] = [
  { step: 1, label: "New Lead" },
  { step: 2, label: "Deposit Paid" },
  { step: 3, label: "Contract Signed" },
  { step: 4, label: "Pre-Site" },
  { step: 5, label: "In Construction" },
  { step: 6, label: "Completed" },
];

export type TimelineStep = {
  step: number;
  label: string;
  state: "done" | "current" | "upcoming";
};

/**
 * Build the 6-step timeline for a lead, marking each step done / current /
 * upcoming relative to the milestone. A not-proceeding lead (step 0) has every
 * step "upcoming" — the detail page shows a distinct banner for that case.
 */
export function buildMilestoneTimeline(m: ReferralMilestone): TimelineStep[] {
  return MILESTONE_STEPS.map((s) => ({
    step: s.step,
    label: s.label,
    state:
      s.step < m.step ? "done" : s.step === m.step ? "current" : "upcoming",
  }));
}
