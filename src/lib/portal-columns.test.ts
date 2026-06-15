import { describe, it, expect } from "vitest";
import {
  PORTAL_PROJECT_COLUMNS,
  PORTAL_CONTACT_COLUMNS,
  PORTAL_DEPOSIT_PLAN_COLUMNS,
  PORTAL_DEPOSIT_PAYMENT_COLUMNS,
  PORTAL_ALLOWED_ACTIVITY_TYPES,
  PORTAL_HIDDEN_KEYWORDS,
  scrubCommission,
  isClientVisibleActivity,
  containsHiddenKeyword,
} from "./portal-columns";

// Anything matching one of these patterns must never appear in a column
// allow-list. If a future edit adds e.g. `commission_amount` to a portal
// SELECT, this list is what fails the build. Tasks, internal notes and
// rep/agent fields are equally forbidden — clients see none of them.
const FORBIDDEN_COLUMN_PATTERNS = [
  /commission/i,
  /payout/i,
  /agent_split/i,
  /referral_(commission|amount|fee)/i,
  /internal_notes?/i,
  /rep_notes?/i,
  /\bnotes\b/i,
  /\btask/i,
  /assigned_to/i,
  /client_email/i,
  /client_name/i,
  /sales_rep_id/i, // not needed by the deposit UI
];

function columnsOf(list: string): string[] {
  return list.split(",").map((c) => c.trim()).filter(Boolean);
}

describe("portal column allow-lists exclude every internal/commission field", () => {
  const lists: Array<[string, string]> = [
    ["PORTAL_DEPOSIT_PLAN_COLUMNS", PORTAL_DEPOSIT_PLAN_COLUMNS],
    ["PORTAL_DEPOSIT_PAYMENT_COLUMNS", PORTAL_DEPOSIT_PAYMENT_COLUMNS],
  ];

  for (const [name, list] of lists) {
    it(`${name} contains no forbidden column`, () => {
      for (const col of columnsOf(list)) {
        for (const pat of FORBIDDEN_COLUMN_PATTERNS) {
          expect(pat.test(col), `${name} leaks "${col}" (matched ${pat})`).toBe(
            false
          );
        }
      }
    });
  }

  // The projects + contacts lists are broader (they intentionally carry
  // some internal-but-client-safe ids like sales_rep_id / referral-free
  // fields), so we only assert the hard commission/payout/task bans here.
  const hardBans = [/commission/i, /payout/i, /agent_split/i, /\btask/i, /internal_notes?/i, /rep_notes?/i];
  for (const [name, list] of [
    ["PORTAL_PROJECT_COLUMNS", PORTAL_PROJECT_COLUMNS],
    ["PORTAL_CONTACT_COLUMNS", PORTAL_CONTACT_COLUMNS],
  ] as Array<[string, string]>) {
    it(`${name} contains no commission/payout/task column`, () => {
      for (const col of columnsOf(list)) {
        for (const pat of hardBans) {
          expect(pat.test(col), `${name} leaks "${col}"`).toBe(false);
        }
      }
    });
  }
});

describe("scrubCommission strips commission-shaped keys at any depth", () => {
  it("removes top-level commission keys", () => {
    const row = {
      id: "p1",
      name: "Project",
      commission_amount: 5000,
      commission_pct: 2.5,
      referral_commission: 1000,
      agent_commission: 250,
    };
    const out = scrubCommission(row) as Record<string, unknown>;
    expect(out.id).toBe("p1");
    expect(out.name).toBe("Project");
    expect("commission_amount" in out).toBe(false);
    expect("commission_pct" in out).toBe(false);
    expect("referral_commission" in out).toBe(false);
    expect("agent_commission" in out).toBe(false);
  });

  it("removes commission keys inside arrays and nested objects", () => {
    const data = [
      { id: 1, commission_amount: 1, nested: { commission_pct: 9, ok: true } },
      { id: 2, ok: "yes" },
    ];
    const out = scrubCommission(data) as any[];
    expect(out[0].commission_amount).toBeUndefined();
    expect(out[0].nested.commission_pct).toBeUndefined();
    expect(out[0].nested.ok).toBe(true);
    expect(out[1].ok).toBe("yes");
  });

  it("leaves non-commission data untouched", () => {
    const row = { id: "x", land_price: 100, build_price: 200 };
    expect(scrubCommission(row)).toEqual(row);
  });
});

describe("isClientVisibleActivity hides tasks, notes and internal rows", () => {
  it("rejects task / note / call / commission activity types", () => {
    for (const type of ["task", "note", "call", "commission", "referral_commission"]) {
      expect(isClientVisibleActivity({ type, title: "x" })).toBe(false);
    }
  });

  it('rejects an "Auto-task: Order gift hamper" row even if typed as a meeting', () => {
    expect(
      isClientVisibleActivity({
        type: "meeting",
        title: "Auto-task: Order gift hamper",
      })
    ).toBe(false);
  });

  it("rejects rows whose text mentions commission", () => {
    expect(
      isClientVisibleActivity({
        type: "email",
        title: "Commission paid to agent",
      })
    ).toBe(false);
  });

  it("allows a genuine client-friendly stage milestone", () => {
    expect(
      isClientVisibleActivity({
        type: "stage_change",
        title: "Moved stage",
        metadata: { new_stage: "construction_base" },
      })
    ).toBe(true);
  });

  it("hides internal-only stage transitions", () => {
    expect(
      isClientVisibleActivity({
        type: "stage_change",
        title: "Gift hamper sent",
        metadata: { new_stage: "gift_hamper_sent" },
      })
    ).toBe(false);
  });
});

describe("hidden-keyword guard", () => {
  it("covers the internal concepts clients must never see", () => {
    for (const kw of ["commission", "gift hamper", "rep notes", "auto-task:", "internal"]) {
      expect(PORTAL_HIDDEN_KEYWORDS).toContain(kw);
    }
  });

  it("flags free text that mentions a hidden topic", () => {
    expect(containsHiddenKeyword("Pay the agent commission")).toBe(true);
    expect(containsHiddenKeyword("Auto-task: chase deposit")).toBe(true);
    expect(containsHiddenKeyword("Your slab has been poured")).toBe(false);
  });
});

describe("allowed activity types stay minimal", () => {
  it("never includes task/note/call/commission", () => {
    for (const banned of ["task", "note", "call", "commission"]) {
      expect(PORTAL_ALLOWED_ACTIVITY_TYPES as readonly string[]).not.toContain(
        banned
      );
    }
  });
});
