import { describe, it, expect } from "vitest";
import {
  allowedPartnerIds,
  memberSummaries,
  partnerLabel,
  partnerLabelById,
} from "@/lib/referral/team";
import type {
  PartnerCommission,
  ReferralPartner,
  ReferredLead,
} from "@/lib/referral/get-referral-bundle";

const owner: ReferralPartner = {
  id: "tony",
  name: "Finance Family",
  contact_name: "Tony Owner",
  email: "tony@financefamily.com.au",
};

const team = [
  { id: "amy", name: "Finance Family", contact_name: "Amy Broker" },
  { id: "ben", name: null, contact_name: "Ben Broker" },
];

function lead(referredById: string, step: number): ReferredLead {
  return {
    id: `lead-${referredById}-${step}`,
    projectName: null,
    clientName: "Client",
    referredOn: null,
    milestone: { step, label: "x", tone: "neutral" } as ReferredLead["milestone"],
    hasNote: false,
    referredById,
    referredBy: null,
  };
}

function commission(
  referredById: string,
  amount: number,
  status: string
): PartnerCommission {
  return {
    id: `c-${referredById}-${amount}-${status}`,
    projectName: null,
    clientName: null,
    amount,
    status,
    dueDate: null,
    paidDate: null,
    referredById,
    referredBy: null,
  };
}

describe("partnerLabel", () => {
  it("prefers the person over the business name", () => {
    expect(partnerLabel(owner)).toBe("Tony Owner");
    expect(partnerLabel({ name: "Finance Family", contact_name: null })).toBe(
      "Finance Family"
    );
    expect(partnerLabel(null)).toBe("Partner");
  });
});

describe("allowedPartnerIds", () => {
  it("is the signed-in partner plus their team", () => {
    expect(allowedPartnerIds(owner, team)).toEqual(["tony", "amy", "ben"]);
  });

  it("is just the partner for staff / solo logins (no team)", () => {
    expect(allowedPartnerIds({ id: "amy" }, [])).toEqual(["amy"]);
  });
});

describe("partnerLabelById", () => {
  it("maps every member to a display label", () => {
    const map = partnerLabelById(owner, team);
    expect(map.get("tony")).toBe("Tony Owner");
    expect(map.get("amy")).toBe("Amy Broker");
    expect(map.get("ben")).toBe("Ben Broker");
  });
});

describe("memberSummaries", () => {
  it("rolls up each member's leads, conversions and commissions", () => {
    const leads = [
      lead("tony", 2),
      lead("amy", 6), // converted
      lead("amy", 1),
      lead("ben", 9), // converted
    ];
    const commissions = [
      commission("amy", 1000, "paid"),
      commission("amy", 500, "pending"),
      commission("ben", 750, "due"),
      commission("ben", 100, "cancelled"), // ignored
    ];
    const rows = memberSummaries(leads, commissions, owner, team);
    expect(rows.map((r) => r.id)).toEqual(["tony", "amy", "ben"]);
    expect(rows[0]).toMatchObject({
      isOwner: true,
      leadCount: 1,
      convertedCount: 0,
      pending: 0,
      paid: 0,
    });
    expect(rows[1]).toMatchObject({
      label: "Amy Broker",
      isOwner: false,
      leadCount: 2,
      convertedCount: 1,
      pending: 500,
      paid: 1000,
    });
    expect(rows[2]).toMatchObject({
      leadCount: 1,
      convertedCount: 1,
      pending: 750,
      paid: 0,
    });
  });

  it("ignores rows referred by a partner outside the organisation", () => {
    const rows = memberSummaries(
      [lead("someone-else", 6)],
      [commission("someone-else", 999, "paid")],
      owner,
      team
    );
    expect(rows.every((r) => r.leadCount === 0 && r.paid === 0)).toBe(true);
  });
});
