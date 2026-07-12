import { describe, it, expect } from "vitest";
import {
  selectionOpenState,
  validateSelectionChoice,
  describeSelection,
  nextBusinessDay,
} from "./selections";

const NOW = new Date("2026-07-13T00:00:00Z");

describe("selectionOpenState", () => {
  const base = { status: "sent" as const, expires_at: "2026-08-01T00:00:00Z", completed_at: null };
  it("sent/viewed and unexpired is open", () => {
    expect(selectionOpenState(base, NOW)).toBe("open");
    expect(selectionOpenState({ ...base, status: "viewed" }, NOW)).toBe("open");
  });
  it("past expires_at is closed even before the cron sweeps", () => {
    expect(selectionOpenState({ ...base, expires_at: "2026-07-01T00:00:00Z" }, NOW)).toBe("closed");
  });
  it("completed/cancelled/expired map correctly", () => {
    expect(selectionOpenState({ ...base, status: "completed", completed_at: "x" }, NOW)).toBe("completed");
    expect(selectionOpenState({ ...base, status: "cancelled" }, NOW)).toBe("closed");
    expect(selectionOpenState({ ...base, status: "expired" }, NOW)).toBe("closed");
  });
});

describe("validateSelectionChoice", () => {
  const request = {
    include_facades: true,
    include_external_colours: true,
    include_internal_colours: false,
    facade_option_ids: ["f1", "f2"],
    external_colour_ids: ["e1"],
    internal_colour_ids: [],
  };

  it("accepts a full valid pick", () => {
    expect(
      validateSelectionChoice(request, { facade_id: "f1", external_id: "e1" })
    ).toEqual({ ok: true });
  });
  it("requires a facade when facades were sent", () => {
    const r = validateSelectionChoice(request, { external_id: "e1" });
    expect(r.ok).toBe(false);
  });
  it("rejects an id that was never offered on this request", () => {
    const r = validateSelectionChoice(request, { facade_id: "f9", external_id: "e1" });
    expect(r.ok).toBe(false);
  });
  it("requires the external colour when included", () => {
    const r = validateSelectionChoice(request, { facade_id: "f1" });
    expect(r.ok).toBe(false);
  });
  it("rejects colour picks for sections that were not included", () => {
    const r = validateSelectionChoice(request, {
      facade_id: "f1",
      external_id: "e1",
      internal_id: "i1",
    });
    expect(r.ok).toBe(false);
  });
});

describe("describeSelection", () => {
  it("joins picks", () => {
    expect(describeSelection({ facade: "Astoria", external: "Dune" })).toBe(
      "Client selected facade: Astoria; External: Dune"
    );
  });
});

describe("nextBusinessDay", () => {
  it("skips the weekend", () => {
    expect(nextBusinessDay(new Date("2026-07-10T00:00:00Z"))).toBe("2026-07-13");
    expect(nextBusinessDay(new Date("2026-07-14T00:00:00Z"))).toBe("2026-07-15");
  });
});
