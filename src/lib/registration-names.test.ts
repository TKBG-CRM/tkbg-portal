import { describe, it, expect } from "vitest";
import { middleNameSettled, purchaserStepComplete } from "./registration-names";

const PRIMARY = {
  first_name: "Brodie",
  middle_name: "",
  last_name: "Batson",
  email: "brodie@example.com",
  mobile: "0400 000 000",
};

describe("middleNameSettled", () => {
  it("settles when a middle name is typed OR explicitly declined, not before", () => {
    expect(middleNameSettled({ middle_name: "" })).toBe(false);
    expect(middleNameSettled({ middle_name: "   " })).toBe(false);
    expect(middleNameSettled({ middle_name: "James" })).toBe(true);
    expect(middleNameSettled({ middle_name: "", no_middle_name: true })).toBe(true);
  });
});

describe("purchaserStepComplete", () => {
  it("blocks the step until the primary's middle name is typed or declined", () => {
    expect(purchaserStepComplete({ primary: PRIMARY, additional: [] })).toBe(false);
    expect(
      purchaserStepComplete({
        primary: { ...PRIMARY, middle_name: "James" },
        additional: [],
      })
    ).toBe(true);
    expect(
      purchaserStepComplete({
        primary: { ...PRIMARY, no_middle_name: true },
        additional: [],
      })
    ).toBe(true);
  });

  it("still requires the primary's name and contact details", () => {
    expect(
      purchaserStepComplete({
        primary: { ...PRIMARY, no_middle_name: true, email: "" },
        additional: [],
      })
    ).toBe(false);
    expect(
      purchaserStepComplete({
        primary: { ...PRIMARY, no_middle_name: true, first_name: " " },
        additional: [],
      })
    ).toBe(false);
  });

  it("holds every named additional purchaser to the same middle-name rule", () => {
    const primary = { ...PRIMARY, no_middle_name: true };
    const partner = { first_name: "Sarah", middle_name: "", last_name: "Batson" };
    expect(purchaserStepComplete({ primary, additional: [partner] })).toBe(false);
    expect(
      purchaserStepComplete({
        primary,
        additional: [{ ...partner, middle_name: "Anne" }],
      })
    ).toBe(true);
    expect(
      purchaserStepComplete({
        primary,
        additional: [{ ...partner, no_middle_name: true }],
      })
    ).toBe(true);
  });

  it("ignores completely blank additional purchaser rows", () => {
    expect(
      purchaserStepComplete({
        primary: { ...PRIMARY, no_middle_name: true },
        additional: [{ first_name: "", middle_name: "", last_name: "" }],
      })
    ).toBe(true);
  });
});
