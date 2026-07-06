// Centralised date/time formatting for TKBG.
//
// Every user-facing date in the CRM and the client portal must render in
// Australia/Melbourne time — staff and clients are all in Victoria and
// comparing "what date did X happen" to UTC-rendered output is an easy way
// to make decisions on the wrong day. Use these helpers instead of
// `.toLocaleDateString()` / `date-fns format()` directly whenever you're
// displaying a date/time to a human.

export const TZ = "Australia/Melbourne";

type DateInput = string | number | Date | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Short date: "18 Apr 2026". Suitable for lists, cards, timelines.
 */
export function formatAuDate(input: DateInput, fallback = ""): string {
  const d = toDate(input);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Long date + time: "18 Apr 2026, 3:45 PM". Use when the specific time
 * matters (meetings, email timestamps, activity entries).
 */
export function formatAuDateTime(input: DateInput, fallback = ""): string {
  const d = toDate(input);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Time only: "3:45 PM". Use alongside a relative label like "Today".
 */
export function formatAuTime(input: DateInput, fallback = ""): string {
  const d = toDate(input);
  if (!d) return fallback;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * YYYY-MM-DD as seen in Melbourne. Useful for grouping/comparison
 * (e.g. "all activities on 2026-04-18" regardless of UTC rollover).
 */
export function formatAuIsoDate(input: DateInput, fallback = ""): string {
  const d = toDate(input);
  if (!d) return fallback;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return y && m && day ? `${y}-${m}-${day}` : fallback;
}
