import { STAGE_CONFIG } from "@/lib/stages";

/**
 * Referral-safe milestone mapping — pure, no server/db imports so it can be
 * unit-tested and reused. The referral partner sees "where their referral is up
 * to", NOT the granular internal pipeline stage id or any internal note.
 *
 * The early (pre-deposit) journey is broken out so partners can follow the
 * nurture progress — Contacted, Discovery Meeting, Options Presented — instead
 * of every lead reading "New Lead" until a deposit is paid. Thresholds are keyed
 * off named stages' order in STAGE_CONFIG so they survive re-ordering.
 */
export type ReferralMilestone = {
  key: string;
  label: string;
  step: number; // 0 = not proceeding, 1..9 along the journey
  tone: "neutral" | "gold" | "green" | "red";
};

export const TOTAL_STEPS = 9;

// Named-stage order landmarks (fall back to the known values if absent).
const ORDER = (id: string, fallback: number) => STAGE_CONFIG[id]?.order ?? fallback;

export function referralMilestone(stageId: string | null): ReferralMilestone {
  if (!stageId) {
    return { key: "new", label: "New Lead", step: 1, tone: "neutral" };
  }
  if (stageId === "out_of_market") {
    return { key: "not_proceeding", label: "Not Proceeding", step: 0, tone: "red" };
  }
  // Royston-only step between deposit and contract request — not in this app's
  // STAGE_CONFIG copy, so map it explicitly.
  if (stageId === "preliminary_works_agreement") {
    return { key: "deposit_paid", label: "Deposit Paid", step: 5, tone: "gold" };
  }

  const cfg = STAGE_CONFIG[stageId];
  const phase = cfg?.phase ?? "new_lead";
  const order = cfg?.order ?? 0;

  if (phase === "completed") {
    return { key: "completed", label: "Completed", step: 9, tone: "green" };
  }
  if (phase === "construction") {
    return { key: "construction", label: "In Construction", step: 8, tone: "green" };
  }
  if (phase === "pre_site") {
    return { key: "pre_site", label: "Pre-Site", step: 7, tone: "gold" };
  }
  if (phase === "new_sale") {
    if (order >= ORDER("contract_signed", 19)) {
      return { key: "contract_signed", label: "Contract Signed", step: 6, tone: "green" };
    }
    return { key: "deposit_paid", label: "Deposit Paid", step: 5, tone: "gold" };
  }

  // --- new_lead phase: the early nurture journey ---
  if (order >= ORDER("research", 7)) {
    return { key: "options_presented", label: "Options Presented", step: 4, tone: "gold" };
  }
  if (order >= ORDER("discovery_meeting_booked", 5)) {
    return { key: "discovery_meeting", label: "Discovery Meeting", step: 3, tone: "gold" };
  }
  if (order >= ORDER("contact_attempted", 2)) {
    return { key: "contacted", label: "Contacted", step: 2, tone: "gold" };
  }
  return { key: "new", label: "New Lead", step: 1, tone: "neutral" };
}

export function milestoneProgressPct(step: number): number {
  if (step <= 0) return 0;
  return Math.round((step / TOTAL_STEPS) * 100);
}

/** The ordered partner-facing journey, used to render the lead timeline. */
export const MILESTONE_STEPS: { step: number; label: string }[] = [
  { step: 1, label: "New Lead" },
  { step: 2, label: "Contacted" },
  { step: 3, label: "Discovery Meeting" },
  { step: 4, label: "Options Presented" },
  { step: 5, label: "Deposit Paid" },
  { step: 6, label: "Contract Signed" },
  { step: 7, label: "Pre-Site" },
  { step: 8, label: "In Construction" },
  { step: 9, label: "Completed" },
];

export type TimelineStep = {
  step: number;
  label: string;
  state: "done" | "current" | "upcoming";
};

/**
 * Build the timeline for a lead, marking each step done / current / upcoming
 * relative to the milestone. A not-proceeding lead (step 0) has every step
 * "upcoming" — the detail page shows a distinct banner for that case.
 */
export function buildMilestoneTimeline(m: ReferralMilestone): TimelineStep[] {
  return MILESTONE_STEPS.map((s) => ({
    step: s.step,
    label: s.label,
    state:
      s.step < m.step ? "done" : s.step === m.step ? "current" : "upcoming",
  }));
}
