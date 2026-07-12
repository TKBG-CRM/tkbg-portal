import { describe, it, expect } from "vitest";
import {
  MAX_VISUALISATIONS,
  visualisationsRemaining,
  SCHEME_PRESETS,
  presetById,
  buildVisualiserPrompt,
  customSchemeDescription,
  VISUALISER_DISCLAIMER,
} from "./visualiser";

describe("visualisationsRemaining", () => {
  it("counts down from the cap and floors at zero", () => {
    expect(visualisationsRemaining(0)).toBe(MAX_VISUALISATIONS);
    expect(visualisationsRemaining(MAX_VISUALISATIONS - 1)).toBe(1);
    expect(visualisationsRemaining(MAX_VISUALISATIONS)).toBe(0);
    expect(visualisationsRemaining(999)).toBe(0);
    expect(visualisationsRemaining(-5)).toBe(MAX_VISUALISATIONS);
  });
});

describe("scheme presets", () => {
  it("resolve by id and have unique ids", () => {
    expect(presetById("coastal_light")?.label).toBe("Light & Coastal");
    expect(presetById("nope")).toBeNull();
    expect(new Set(SCHEME_PRESETS.map((p) => p.id)).size).toBe(SCHEME_PRESETS.length);
  });
});

describe("buildVisualiserPrompt", () => {
  it("locks the structure and only recolours", () => {
    const prompt = buildVisualiserPrompt(SCHEME_PRESETS[0].description);
    expect(prompt).toContain("Keep the exact same house");
    expect(prompt).toContain("Only change the colours");
    expect(prompt).toContain("light coastal palette");
  });
});

describe("customSchemeDescription", () => {
  it("rejects junk and caps length", () => {
    expect(customSchemeDescription("  ")).toBeNull();
    expect(customSchemeDescription("ab")).toBeNull();
    const long = customSchemeDescription("x".repeat(500));
    expect(long).not.toBeNull();
    expect((long as string).length).toBeLessThan(360);
  });
  it("wraps a usable description", () => {
    expect(customSchemeDescription("sage green with off white trims")).toContain(
      "sage green with off white trims"
    );
  });
});

describe("disclaimer", () => {
  it("covers AI generation, variance and price impacts", () => {
    expect(VISUALISER_DISCLAIMER).toContain("AI generated");
    expect(VISUALISER_DISCLAIMER).toContain("will vary");
    expect(VISUALISER_DISCLAIMER).toContain("price impacts");
    expect(VISUALISER_DISCLAIMER).toContain("do not form part of your selection");
  });
});
