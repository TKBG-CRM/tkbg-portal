import { describe, it, expect } from "vitest";
import {
  referralMilestone,
  milestoneProgressPct,
  buildMilestoneTimeline,
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

  it("maps a deposit-received (pre contract-signed) new_sale stage to Deposit Paid", () => {
    const m = referralMilestone("initial_deposit_received");
    expect(m.key).toBe("deposit_paid");
    expect(m.step).toBe(2);
  });

  it("does not regress despite the order-11/12 collision", () => {
    expect(referralMilestone("initial_deposit_received").key).toBe("deposit_paid");
    expect(referralMilestone("preliminary_works_agreement").key).toBe("deposit_paid");
  });

  it("maps contract_signed and later new_sale stages to Contract Signed", () => {
    expect(referralMilestone("contract_signed").key).toBe("contract_signed");
    expect(referralMilestone("bod_received").key).toBe("contract_signed");
  });

  it("maps pre_site / construction / completed phases", () => {
    expect(referralMilestone("land_titled").key).toBe("pre_site");
    expect(referralMilestone("construction_base").key).toBe("construction");
    expect(referralMilestone("handover_completed").key).toBe("completed");
  });
});

describe("milestoneProgressPct", () => {
  it("is 0 for not-proceeding, scales 1..6", () => {
    expect(milestoneProgressPct(0)).toBe(0);
    expect(milestoneProgressPct(3)).toBe(50);
    expect(milestoneProgressPct(6)).toBe(100);
  });
});

describe("buildMilestoneTimeline", () => {
  it("marks steps done / current / upcoming around the milestone", () => {
    const t = buildMilestoneTimeline(referralMilestone("contract_signed")); // step 3
    expect(t).toHaveLength(6);
    expect(t[0].state).toBe("done");
    expect(t[2].state).toBe("current");
    expect(t[3].state).toBe("upcoming");
  });

  it("has no current step for a not-proceeding lead (all upcoming)", () => {
    const t = buildMilestoneTimeline(referralMilestone("out_of_market"));
    expect(t.every((s) => s.state === "upcoming")).toBe(true);
  });
});
