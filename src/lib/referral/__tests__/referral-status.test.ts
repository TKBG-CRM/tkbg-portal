import { describe, it, expect } from "vitest";
import {
  referralMilestone,
  milestoneProgressPct,
  buildMilestoneTimeline,
  TOTAL_STEPS,
} from "../referral-status";

describe("referralMilestone", () => {
  it("treats a missing stage as an open New Lead", () => {
    const m = referralMilestone(null);
    expect(m.key).toBe("new");
    expect(m.step).toBe(1);
  });

  it("maps out_of_market to Not Proceeding (step 0)", () => {
    const m = referralMilestone("out_of_market");
    expect(m.key).toBe("not_proceeding");
    expect(m.step).toBe(0);
    expect(m.tone).toBe("red");
  });

  it("breaks out the early nurture journey", () => {
    expect(referralMilestone("enquiry_made").key).toBe("new");
    expect(referralMilestone("contact_attempted").key).toBe("contacted");
    expect(referralMilestone("initial_contact_made").key).toBe("contacted");
    expect(referralMilestone("working_enquiry").key).toBe("contacted");
    expect(referralMilestone("discovery_meeting_booked").key).toBe("discovery_meeting");
    expect(referralMilestone("discovery_meeting_completed").key).toBe("discovery_meeting");
    expect(referralMilestone("research").key).toBe("options_presented");
    expect(referralMilestone("presentation_completed").key).toBe("options_presented");
    expect(referralMilestone("finalising_option").key).toBe("options_presented");
  });

  it("maps a deposit-received (pre contract-signed) new_sale stage to Deposit Paid", () => {
    const m = referralMilestone("initial_deposit_received");
    expect(m.key).toBe("deposit_paid");
    expect(m.step).toBe(5);
  });

  it("does not regress despite the order-11/12 collision", () => {
    expect(referralMilestone("initial_deposit_received").key).toBe("deposit_paid");
    expect(referralMilestone("preliminary_works_agreement").key).toBe("deposit_paid");
  });

  it("maps contract_signed and later new_sale stages to Contract Signed", () => {
    expect(referralMilestone("contract_signed").key).toBe("contract_signed");
    expect(referralMilestone("contract_signed").step).toBe(6);
    expect(referralMilestone("bod_received").key).toBe("contract_signed");
  });

  it("maps pre_site and completed phases", () => {
    expect(referralMilestone("land_titled").key).toBe("pre_site");
    expect(referralMilestone("land_titled").step).toBe(7);
    expect(referralMilestone("handover_completed").key).toBe("completed");
    expect(referralMilestone("handover_completed").step).toBe(13);
  });

  it("breaks construction out into the build stages", () => {
    expect(referralMilestone("construction_base")).toMatchObject({
      key: "construction_base",
      label: "Base Stage",
      step: 8,
    });
    expect(referralMilestone("construction_frame")).toMatchObject({
      key: "construction_frame",
      label: "Frame Stage",
      step: 9,
    });
    expect(referralMilestone("construction_lockup").step).toBe(10);
    expect(referralMilestone("construction_fixout").step).toBe(11);
    expect(referralMilestone("construction_completion").step).toBe(12);
  });
});

describe("milestoneProgressPct", () => {
  it("is 0 for not-proceeding, scales 1..13", () => {
    expect(TOTAL_STEPS).toBe(13);
    expect(milestoneProgressPct(0)).toBe(0);
    expect(milestoneProgressPct(13)).toBe(100);
  });
});

describe("buildMilestoneTimeline", () => {
  it("marks steps done / current / upcoming around the milestone", () => {
    const t = buildMilestoneTimeline(referralMilestone("discovery_meeting_booked")); // step 3
    expect(t).toHaveLength(13);
    expect(t[0].state).toBe("done");
    expect(t[2].state).toBe("current");
    expect(t[3].state).toBe("upcoming");
  });

  it("has no current step for a not-proceeding lead (all upcoming)", () => {
    const t = buildMilestoneTimeline(referralMilestone("out_of_market"));
    expect(t.every((s) => s.state === "upcoming")).toBe(true);
  });

  it("carries the two instalment markers: 50% at Contract Signed, balance at Frame", () => {
    const t = buildMilestoneTimeline(referralMilestone("construction_base")); // step 8
    const withPayment = t.filter((s) => s.payment);
    expect(withPayment.map((s) => s.step)).toEqual([6, 9]);
    expect(t[5].payment).toContain("First 50%");
    expect(t[5].state).toBe("done"); // contract instalment already triggered
    expect(t[8].payment).toContain("Balance 50%");
    expect(t[8].state).toBe("upcoming"); // frame instalment still ahead of Base
    expect(t[7].payment).toBeNull();
  });
});
