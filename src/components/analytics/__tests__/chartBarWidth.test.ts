/**
 * Every Recharts bar constrains its width, or says why it needn't.
 *
 * A `<Bar>` with no width constraint expands to fill its category slot. With
 * one bin that is not a bar, it is a slab across half the card — which is
 * exactly what the Analytics charts showed for anyone in their first weeks,
 * and what any range-scoped chart falls back to whenever the chosen range
 * holds a single bin. Cold start is a most-seen state for the user base
 * (CLAUDE.md), so "only while you have little data" is the wrong side to be
 * broken on.
 *
 * `CalorieBalanceChart` had solved it locally with a fixed `barSize` long
 * before the others did. That is the shape this repo keeps meeting: one place
 * fixes it, the siblings never hear. A prose note would have the same
 * half-life as the fix, so the rule is executable.
 *
 * Only Recharts bars are in scope. `LoadingSkeleton` exports its own local
 * `Bar` for skeleton rows, which has nothing to do with charts — the scan
 * keys on the file importing from "recharts" so that one cannot drift in.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "../../..");

/**
 * Bars that legitimately need no cap, with the reason. A stacked daily series
 * over a fixed multi-week window is dense by construction — its natural width
 * is already far below any cap, so adding one would be decoration.
 */
const EXEMPT: Record<string, string> = {
  "components/analytics/TrainingLoadCard.tsx":
    "one stacked bin per day across the page's own range pill — 7 bars at " +
    "1W up to 365 at 1Y, so the width is set by the window rather than by " +
    "sparseness, and the single-bin slab this rule exists to stop cannot " +
    "occur when the bin count IS the window in days",
};

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      tsxFiles(full, out);
    } else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Files that render a Recharts <Bar>, by src-relative path. */
function rechartsBarFiles(): string[] {
  return tsxFiles(srcRoot)
    .filter((f) => {
      const body = readFileSync(f, "utf8");
      return /from\s+"recharts"/.test(body) && /<Bar[\s\n]/.test(body);
    })
    .map((f) => f.slice(srcRoot.length + 1));
}

/** Each <Bar …> element's opening tag, so props can be inspected. */
function barTags(relPath: string): string[] {
  const body = readFileSync(join(srcRoot, relPath), "utf8");
  return [...body.matchAll(/<Bar[\s\n][^>]*?\/?>/g)].map((m) => m[0]);
}

describe("Recharts bars — width is constrained", () => {
  const files = rechartsBarFiles();

  it("finds the chart files (a scan that matches nothing proves nothing)", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files).toContain("components/analytics/VolumeChart.tsx");
    expect(files).toContain("components/progress/CalorieBalanceChart.tsx");
  });

  it("excludes LoadingSkeleton's own non-Recharts Bar", () => {
    expect(files).not.toContain("components/LoadingSkeleton.tsx");
  });

  it("every bar caps its width, or is listed as exempt with a reason", () => {
    const uncapped: string[] = [];
    for (const file of files) {
      if (EXEMPT[file]) continue;
      for (const tag of barTags(file)) {
        if (!/\b(maxBarSize|barSize)=/.test(tag)) {
          uncapped.push(`${file}: ${tag.replace(/\s+/g, " ").slice(0, 60)}…`);
        }
      }
    }
    expect(uncapped, "uncapped Recharts bars").toEqual([]);
  });

  it("every exemption names a file that still has a bar in it", () => {
    /* An exemption outliving its chart is the same rot one level down. */
    const stale = Object.keys(EXEMPT).filter((f) => !files.includes(f));
    expect(stale, "exemptions for files with no Recharts bar").toEqual([]);
  });
});
