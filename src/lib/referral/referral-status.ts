import { STAGE_CONFIG } from "@/lib/stages";

/**
 * Referral-safe milestone mapping — pure, no server/db imports so it can be
 * unit-tested and reused. The referral partner sees "where their referral is up
 * to", NOT the granular internal pipeline stage id or any internal note.
 *
 * The early (pre-deposit) journey is broken out so partners can follow the
 * nurture progress — Contacted, Discovery Meeting, Options Presented — instead
 * of every lead reading "New Lead" until a deposit is paid. Construction is
 * broken out into the build stages (Base, Frame, Lockup, Fixing, Completion)
 * because the standard referral agreement pays in two instalments — 50% at
 * contract signing and the balance 50% at frame stage — so partners need to
 * see exactly where the build is relative to their payment triggers.
 * Thresholds are keyed off named stages' order in STAGE_CONFIG so they
 * survive re-ordering.
 */
export type ReferralMilestone = {
  key: string;
  label: string;
  step: number; // 0 = not proceeding, 1..13 along the journey
  tone: "neutral" | "gold" | "green" | "red";
};

export const TOTAL_STEPS = 13;

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
    return { key: "completed", label: "Completed", step: 13, tone: "green" };
  }
  if (phase === "construction") {
    // The Victorian build stages, in order. An unknown construction stage reads
    // as Base (the first) rather than overstating progress.
    if (order >= ORDER("construction_completion", 39)) {
      return { key: "construction_completion", label: "Completion Stage", step: 12, tone: "green" };
    }
    if (order >= ORDER("construction_fixout", 38)) {
      return { key: "construction_fixing", label: "Fixing Stage", step: 11, tone: "green" };
    }
    if (order >= ORDER("construction_lockup", 37)) {
      return { key: "construction_lockup", label: "Lockup Stage", step: 10, tone: "green" };
    }
    if (order >= ORDER("construction_frame", 36)) {
      return { key: "construction_frame", label: "Frame Stage", step: 9, tone: "green" };
    }
    return { key: "construction_base", label: "Base Stage", step: 8, tone: "green" };
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

/**
 * The ordered partner-facing journey, used to render the lead timeline.
 * `payment` marks the two instalment triggers from the standard referral
 * agreement so a partner can see exactly when their fee becomes payable.
 */
export const MILESTONE_STEPS: { step: number; label: string; payment?: string }[] = [
  { step: 1, label: "New Lead" },
  { step: 2, label: "Contacted" },
  { step: 3, label: "Discovery Meeting" },
  { step: 4, label: "Options Presented" },
  { step: 5, label: "Deposit Paid" },
  {
    step: 6,
    label: "Contract Signed",
    payment: "First 50% of your referral fee becomes payable",
  },
  { step: 7, label: "Pre-Site" },
  { step: 8, label: "Base Stage" },
  {
    step: 9,
    label: "Frame Stage",
    payment: "Balance 50% of your referral fee becomes payable",
  },
  { step: 10, label: "Lockup Stage" },
  { step: 11, label: "Fixing Stage" },
  { step: 12, label: "Completion Stage" },
  { step: 13, label: "Completed" },
];

/** Shown under the timeline wherever payment markers appear. */
export const PAYMENT_TERMS_NOTE =
  "Referral fee instalments become payable once the stage is complete and Turnkey " +
  "has received the builder's stage payment, as set out in your referral agreement. " +
  "We'll notify you when an instalment is ready to invoice.";

export type TimelineStep = {
  step: number;
  label: string;
  state: "done" | "current" | "upcoming";
  payment: string | null;
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
    payment: s.payment ?? null,
  }));
}
