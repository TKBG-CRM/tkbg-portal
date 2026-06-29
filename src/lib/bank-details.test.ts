import { describe, it, expect } from "vitest";
import {
  buildDepositReference,
  buildDepositBankAccounts,
} from "@/lib/bank-details";

describe("buildDepositReference", () => {
  it("composes Lot <number> <Last name> when both are known", () => {
    expect(buildDepositReference({ lotNumber: "832", lastName: "Denysenko" })).toBe(
      "Lot 832 Denysenko"
    );
  });

  it("falls back to last name only when there is no lot (no project yet)", () => {
    expect(buildDepositReference({ lastName: "Denysenko" })).toBe("Denysenko");
  });

  it("shows a confirm-with-rep placeholder when nothing is known", () => {
    expect(buildDepositReference({})).toBe("(confirm with your sales rep)");
  });

  it("trims and ignores blank parts", () => {
    expect(
      buildDepositReference({ lotNumber: "  ", lastName: "  Smith " })
    ).toBe("Smith");
  });
});

describe("buildDepositBankAccounts", () => {
  it("returns the single Turnkey CBA account with the fixed details", () => {
    const [account, ...rest] = buildDepositBankAccounts({
      lotNumber: "832",
      lastName: "Denysenko",
    });
    expect(rest).toHaveLength(0);
    expect(account.title).toBe("Turnkey Building Group");
    const byLabel = Object.fromEntries(
      account.fields.map((f) => [f.label, f.value])
    );
    expect(byLabel.Bank).toBe("CBA");
    expect(byLabel["Account name"]).toBe("Turnkey Building Group");
    expect(byLabel.BSB).toBe("067 873");
    expect(byLabel.ACC).toBe("19502151");
    expect(byLabel.Reference).toBe("Lot 832 Denysenko");
  });

  it("auto-fills reference from last name alone when no project/lot exists", () => {
    const [account] = buildDepositBankAccounts({ lastName: "Denysenko" });
    const ref = account.fields.find((f) => f.label === "Reference");
    expect(ref?.value).toBe("Denysenko");
  });

  it("omits the Amount row when no amount is supplied", () => {
    const [account] = buildDepositBankAccounts({ lastName: "Smith" });
    expect(account.fields.some((f) => f.label === "Amount")).toBe(false);
  });

  it("includes a formatted AUD Amount row when a positive amount is supplied", () => {
    const [account] = buildDepositBankAccounts({
      lotNumber: "12",
      lastName: "Smith",
      amount: 25000,
    });
    const amt = account.fields.find((f) => f.label === "Amount");
    expect(amt?.value).toBe("$25,000");
  });

  it("ignores zero / negative amounts", () => {
    expect(
      buildDepositBankAccounts({ lastName: "Smith", amount: 0 })[0].fields.some(
        (f) => f.label === "Amount"
      )
    ).toBe(false);
  });
});
