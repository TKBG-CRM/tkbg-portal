import { describe, it, expect } from "vitest";
import { assemblePurchasers, extraPurchaserContacts } from "./registration-purchasers";

describe("extraPurchaserContacts", () => {
  const { purchasers } = assemblePurchasers({
    primary: {
      first_name: "Sarah",
      last_name: "Example",
      email: "sarah@example.com",
      mobile: "0400 000 001",
      idDocumentPaths: [],
    },
    additional: [
      {
        first_name: "Yashiru",
        last_name: "Example",
        email: "yashiru@example.com",
        mobile: "0400 000 002",
      },
      // Junk entry: no name, no email — must be skipped.
      { first_name: "", email: "" },
    ],
    safePrefix: "registration/tok/",
  });

  it("returns only the non primary purchasers with usable identity", () => {
    const extras = extraPurchaserContacts(purchasers);
    expect(extras).toHaveLength(1);
    expect(extras[0]).toEqual({
      first_name: "Yashiru",
      middle_name: null,
      last_name: "Example",
      email: "yashiru@example.com",
      phone: "0400 000 002",
    });
  });

  it("never includes the primary purchaser", () => {
    const extras = extraPurchaserContacts(purchasers);
    expect(extras.some((e) => e.email === "sarah@example.com")).toBe(false);
  });
});
