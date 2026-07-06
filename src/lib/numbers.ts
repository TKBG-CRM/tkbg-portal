// Parse a user-input numeric string that may contain comma separators,
// dollar signs or whitespace (e.g. "$1,000,000" or "1,200.50") into a
// number. Returns null when the input is empty or not a valid number —
// keep callers from accidentally writing NaN into the database.

export function parseAmount(
  input: string | number | null | undefined
): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const cleaned = input.replace(/[$,\s]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Parse but return 0 instead of null when the value is empty/invalid.
// Handy in arithmetic sites where null would fall through awkwardly.
export function parseAmountOrZero(
  input: string | number | null | undefined
): number {
  return parseAmount(input) ?? 0;
}

// Round a money value to whole cents (2 dp). Use this instead of Math.round
// anywhere we derive an amount (e.g. a 5% deposit) so cents are preserved —
// Math.round would silently drop them and break reconciliation against the
// NUMERIC(12,2) columns the database actually stores.
export function roundToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Format a numeric value (or comma/dollar string) as AUD currency, e.g.
// 10000 → "$10,000". Decimals are only shown when the value isn't a
// whole number, so common round figures stay clean.
export function formatAmount(
  input: string | number | null | undefined
): string {
  const n = parseAmount(input);
  if (n == null) return "";
  const hasFraction = Math.abs(n - Math.round(n)) > 0.005;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}
