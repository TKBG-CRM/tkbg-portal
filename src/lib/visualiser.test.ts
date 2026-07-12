import { describe, it, expect } from "vitest";
import {
  buildRefinementPrompt,
  refinementInstruction,
  MAX_VISUALISATIONS,
  visualisationsRemaining,
  visualiserAllowedForRequest,
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

describe("visualiserAllowedForRequest", () => {
  it("only allows selections with no colour scheme sections", () => {
    expect(
      visualiserAllowedForRequest({ include_external_colours: false, include_internal_colours: false })
    ).toBe(true);
    expect(
      visualiserAllowedForRequest({ include_external_colours: true, include_internal_colours: false })
    ).toBe(false);
    expect(
      visualiserAllowedForRequest({ include_external_colours: false, include_internal_colours: true })
    ).toBe(false);
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
    expect(prompt).toContain("Only change the COLOURS");
    expect(prompt).toContain("light coastal palette");
  });
  it("hard forbids adding architectural details", () => {
    const prompt = buildVisualiserPrompt("anything");
    expect(prompt).toContain("Do NOT add");
    expect(prompt).toContain("battens");
    expect(prompt).toContain("ignore that part");
  });
});

describe("preset descriptions never add elements", () => {
  it("only recolours existing surfaces (additions phrased as 'existing')", () => {
    for (const p of SCHEME_PRESETS) {
      // Any timber/cladding/panel mention must be qualified as existing —
      // the visualiser is purely colour, never new details.
      for (const risky of ["timber", "cladding", "panel", "batten", "slat", "accent"]) {
        const idx = p.description.toLowerCase().indexOf(risky);
        if (idx === -1) continue;
        const before = p.description.toLowerCase().slice(Math.max(0, idx - 45), idx);
        expect(before, `preset ${p.id} mentions "${risky}" without qualifying it as existing`).toContain("existing");
      }
    }
  });
});

describe("refinement", () => {
  it("sanitises the instruction like custom descriptions", () => {
    expect(refinementInstruction("  ")).toBeNull();
    expect(refinementInstruction("ok")).toBeNull();
    expect(refinementInstruction("matte black garage  door ")).toBe("matte black garage door");
    expect((refinementInstruction("x".repeat(500)) as string).length).toBe(300);
  });
  it("prompt applies one colour change and forbids additions", () => {
    const prompt = buildRefinementPrompt("matte black garage door");
    expect(prompt).toContain("ONLY this colour change: matte black garage door");
    expect(prompt).toContain("Keep absolutely everything else identical");
    expect(prompt).toContain("Do NOT add");
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
