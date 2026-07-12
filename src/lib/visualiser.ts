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

/**
 * The visualiser only appears on selections with NO colour scheme sections:
 * when a builder's colours come from preset boards, AI colour ways would show
 * clients combinations they cannot actually pick. (The per builder
 * visualiser_enabled flag is checked separately, server side.)
 */
export function visualiserAllowedForRequest(r: {
  include_external_colours: boolean;
  include_internal_colours: boolean;
}): boolean {
  return !r.include_external_colours && !r.include_internal_colours;
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
      "a light coastal palette: white or pale render, light grey roof tiles, whitewashed or blonde brick, the existing garage door in a light timber look finish, and any existing timber elements in light oak",
  },
  {
    id: "monochrome_dark",
    label: "Dark & Monochrome",
    description:
      "a bold monochrome palette: charcoal or dark grey render, black roof, dark grey brick, matte black garage door, window frames and gutters",
  },
  // Preset wording is deliberately specific: named Colorbond/Dulux tones and
  // exact placements keep the model on proven, on trend combinations — vague
  // colour words ("beige", "high contrast") let it invent ugly ones.
  {
    id: "warm_neutrals",
    label: "Warm Neutrals",
    description:
      "a warm neutral palette styled by a colour consultant: soft greige render in a Colorbond Dune tone across the main walls, warm off white Surfmist tone trims, fascia and garage door, a soft mid grey Shale Grey roof, and a matte charcoal front door — sun kissed, muted and cohesive, with no yellow, orange or brown tones",
  },
  {
    id: "classic_red_brick",
    label: "Classic Brick",
    description:
      "an elevated classic brick palette: warm russet brown blend face brick with subtle tonal variation, a deep charcoal Colorbond Monument roof and gutters, any existing render sections in crisp warm white, white window frames and trims, and a black front door — timeless heritage styling done tastefully, with no orange brick and no terracotta roof",
  },
  {
    id: "modern_contrast",
    label: "Modern Contrast",
    description:
      "a refined modern contrast palette: warm white render in a Dulux Natural White tone across most of the facade, a deep matte charcoal Colorbond Monument roof, gutters and window frames, any existing feature cladding or garage door in deep charcoal, and any existing timber elements in warm oak — sharp but restrained designer contrast that highlights the home's form, no pure black walls",
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
    "Only change the COLOURS and surface finishes of the existing external surfaces (render, " +
    "brick, roof, garage door, front door, window frames, gutters and trims). Do NOT add, " +
    "remove or reshape any architectural element or detail — no new cladding, battens, " +
    "slats, panels, mouldings, stonework, lights, plants or props; every element keeps its " +
    "exact shape, position and texture layout, only its colour changes. If the scheme " +
    "mentions an element this home does not have, simply ignore that part. The palette must look " +
    "professionally styled and cohesive — muted, sophisticated, contemporary Australian " +
    "new build tones, like a display home photographed for a builder's brochure. Avoid " +
    "garish, oversaturated or clashing colours. Photorealistic result, no text or watermarks."
  );
}

/** Sanitised custom description → scheme text, or null when unusable. */
export function customSchemeDescription(input: string): string | null {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (cleaned.length < 4) return null;
  return `a colour palette described by the client as: ${cleaned.slice(0, 300)}`;
}

/** Sanitised targeted change ("make the garage door matte black"), or null. */
export function refinementInstruction(input: string): string | null {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (cleaned.length < 4) return null;
  return cleaned.slice(0, 300);
}

/**
 * A follow up edit on an already generated visualisation: apply ONE requested
 * colour change and keep everything else pixel faithful. Same hard no
 * additions constraint as the main prompt.
 */
export function buildRefinementPrompt(instruction: string): string {
  return (
    "Modify this house facade image by applying ONLY this colour change: " +
    instruction.trim() +
    ". Keep absolutely everything else identical — the house, structure, camera angle, " +
    "landscaping, lighting, sky and every other surface's colour stay exactly as they are. " +
    "Do NOT add, remove or reshape any architectural element or detail — no new cladding, " +
    "battens, slats, panels, mouldings, stonework, lights, plants or props. If the request " +
    "asks for anything other than a colour or surface finish change, ignore that part. " +
    "Photorealistic result, no text or watermarks."
  );
}
