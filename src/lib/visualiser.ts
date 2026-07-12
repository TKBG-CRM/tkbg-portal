// AI colour visualiser — pure logic for the facade selection page.
//
// Clients can re render a facade image in a different colour scheme to help
// them visualise colour ways. Every touchpoint carries the disclaimer: the
// images are AI generated, actual selections and availability will vary,
// colour choices can have price impacts, and the visualisation forms no part
// of their selection.

/** Hard ceiling of generations per selection request (paid API, public page). */
export const MAX_VISUALISATIONS = 15;

export function visualisationsRemaining(count: number): number {
  return Math.max(0, MAX_VISUALISATIONS - Math.max(0, count));
}

export const VISUALISER_DISCLAIMER =
  "These images are AI generated to help you visualise different colour ways only. " +
  "Actual colours, materials and product availability will vary, and colour selections " +
  "can have price impacts. Visualisations do not form part of your selection.";

export interface ColourSchemePreset {
  id: string;
  label: string;
  description: string; // what the model is asked to apply
}

export const SCHEME_PRESETS: ColourSchemePreset[] = [
  {
    id: "coastal_light",
    label: "Light & Coastal",
    description:
      "a light coastal palette: white or pale render, light grey roof tiles, whitewashed or blonde brick, light timber look garage door and accents",
  },
  {
    id: "monochrome_dark",
    label: "Dark & Monochrome",
    description:
      "a bold monochrome palette: charcoal or dark grey render, black roof, dark grey brick, matte black garage door, window frames and gutters",
  },
  {
    id: "warm_neutrals",
    label: "Warm Neutrals",
    description:
      "a warm neutral palette: beige and greige render, brown roof tiles, classic cream brick, earthy tan garage door and warm white trims",
  },
  {
    id: "classic_red_brick",
    label: "Classic Brick",
    description:
      "a classic Australian palette: traditional red brown face brick, terracotta roof tiles, cream render accents and a neutral garage door",
  },
  {
    id: "modern_contrast",
    label: "Modern Contrast",
    description:
      "a modern high contrast palette: crisp white render with charcoal feature cladding, black window frames, grey roof and a timber look front door",
  },
];

export function presetById(id: string): ColourSchemePreset | null {
  return SCHEME_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * The image editing instruction. Keeps the home's structure identical and only
 * recolours surfaces — the point is colour ways, not redesigning the facade.
 */
export function buildVisualiserPrompt(schemeDescription: string): string {
  return (
    "Recolour this house facade photo to show " +
    schemeDescription.trim() +
    ". Keep the exact same house, structure, camera angle, landscaping, lighting and sky. " +
    "Only change the colours and materials of the external surfaces (render, brick, roof, " +
    "garage door, front door, window frames, gutters and trims). Photorealistic result, " +
    "no text or watermarks."
  );
}

/** Sanitised custom description → scheme text, or null when unusable. */
export function customSchemeDescription(input: string): string | null {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (cleaned.length < 4) return null;
  return `a colour palette described by the client as: ${cleaned.slice(0, 300)}`;
}
