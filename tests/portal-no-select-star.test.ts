import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// Static guard: a portal client query must never use `select("*")` or a
// bare `select()`. Either ships every column of an internal-bearing table
// (projects, contacts, deposit_*) into the JSON payload the browser can
// read, regardless of what the UI renders. New portal code that reaches
// for select-* fails here before it can ever reach production.

const SRC = join(__dirname, "..", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC);

describe("no portal query uses select('*') or a bare select()", () => {
  it("scans every source file", () => {
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    const selectStar = /\.select\(\s*(["'`])\*\1\s*\)/;
    const bareSelect = /\.select\(\s*\)/;
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (selectStar.test(src) || bareSelect.test(src)) {
        offenders.push(file.replace(SRC, "src"));
      }
    }
    expect(offenders, `select-* found in: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("no nav surface links to internal Tasks/Messages", () => {
  it("the portal layout has no Tasks or Messages nav item", () => {
    const layout = readFileSync(
      join(SRC, "app", "(portal)", "layout.tsx"),
      "utf8"
    );
    // The navItems array drives the client menu. It must not reference
    // internal task / message surfaces.
    expect(/label:\s*["'`]Tasks["'`]/i.test(layout)).toBe(false);
    expect(/label:\s*["'`]Messages["'`]/i.test(layout)).toBe(false);
  });
});
