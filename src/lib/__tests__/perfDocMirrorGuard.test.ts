/**
 * The never-written mirrors may not be read anywhere but the resolver.
 *
 * `PerformanceWeekDoc` declares two nested maps beside its canonical
 * top-level fields:
 *
 *   labels?: { loadBand?: string }
 *   flags?:  { deloadRecommended?: boolean }
 *
 * NO writer emits either one — not `functions/lib/perfScoring.js`, not
 * `functions/performanceEngine.js`, not the client engine. They are
 * optional, so reading them type-checks and silently yields `undefined`
 * forever. That is the whole hazard: the compiler cannot help, the tests
 * pass, and the surface just quietly says the wrong thing.
 *
 * WHY A TEST AND NOT A SWEEP. This has now been swept THREE times.
 *
 *   2026-08-09  PerformanceHeroCard, PerformanceTab, PerformanceIndexChart
 *               moved to `resolveLoadBand` / `resolveDeloadRecommended`.
 *   2026-08-10  `useWeeklyReview` — found to still read the band raw,
 *               beside a comment calling the read canonical because the
 *               deload half next to it had been fixed and the band had not.
 *   2026-08-10  Home.tsx and Program.tsx x2 — found by an audit AFTER the
 *               first sweep declared the class closed.
 *
 * Each sweep was careful and each left live sites behind, so the third
 * one buys a guard instead of a fourth. CLAUDE.md's own design-system
 * note makes the same argument about colour: invariants that "regress
 * constantly and keep getting swept up after the fact" need a failing
 * test, not more vigilance.
 *
 * What the last sweep left broken, for the record: the Programme deload
 * banner and its Apply-deload CTA were dead for every user, Home's
 * one-voice arbiter could not suppress the second voice in exactly the
 * deload case it was written for, and `easierTodayRecommendation`'s
 * deload branch could never fire.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();

/**
 * The resolver is the ONE place allowed to touch the mirrors — reading
 * them there is the point, since a doc that somehow carries only the
 * mirror should still resolve.
 */
const ALLOWED = ["src/lib/performanceDocFields.ts"];

/**
 * Matches a READ of either mirror: `flags.deloadRecommended`,
 * `flags?.deloadRecommended`, `labels.loadBand`, `labels?.loadBand`.
 * The TYPE declarations in performanceTypes.ts are untouched — the maps
 * may keep existing in the shape, they just may not be read.
 */
const MIRROR_READ =
  /\b(flags\s*\??\.\s*deloadRecommended|labels\s*\??\.\s*loadBand)\b/;

/**
 * Production code only. Tests legitimately NAME the mirrors — they seed
 * fixtures carrying them (`usePerformance.test.ts` round-trips a doc with
 * `labels: { loadBand }` to pin the mapper's passthrough, and the
 * resolver's own test seeds mirror-only docs on purpose). The hazard is a
 * SURFACE reading a field nothing writes, and surfaces are not tests.
 */
function sourceFiles(): string[] {
  return globSync("src/**/*.{ts,tsx}", { cwd: ROOT }).filter(
    (f) => !ALLOWED.includes(f) && !f.includes("__tests__")
  );
}

/**
 * Strip comments before scanning. Several FIXED sites carry a "was
 * `flags?.deloadRecommended`" note explaining the bug — that prose is
 * valuable and must not trip the guard. Block comments are the common
 * shape here (JSX uses them), so a line-only filter is not enough.
 *
 * A block comment is replaced by the newlines it CONTAINED rather than by
 * nothing, so line indices still line up with the original file. Deleting
 * them outright reports offenders at the wrong line, which is a small lie
 * that costs the next reader real time.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) =>
      "\n".repeat((m.match(/\n/g) || []).length)
    )
    .replace(/\/\/.*$/gm, "");
}

describe("the never-written performance mirrors are read only by the resolver", () => {
  it("no file outside the resolver reads flags.deloadRecommended or labels.loadBand", () => {
    const files = sourceFiles();
    // Guard the guard — a glob that matched nothing would make this
    // vacuous, which is the exact failure mode the file exists to stop.
    expect(files.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      const raw = readFileSync(resolve(ROOT, file), "utf8");
      const lines = raw.split("\n");
      stripComments(raw)
        .split("\n")
        .forEach((code, i) => {
          if (MIRROR_READ.test(code)) {
            offenders.push(`${file}:${i + 1}  ${lines[i]?.trim() ?? code}`);
          }
        });
    }

    expect(
      offenders,
      `These read a performance-doc mirror that NO writer emits, so they resolve to undefined forever. Use resolveLoadBand() / resolveDeloadRecommended() from @/lib/performanceDocFields — both are total, and the band derivation reproduces the stored value exactly (computeLoadBand is the same pure function the writers used).\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("the resolver everyone is redirected to still exists and is exported", () => {
    /* A guard pointing at a symbol nobody defines would fail people into
       a dead end. */
    const src = readFileSync(
      resolve(ROOT, "src/lib/performanceDocFields.ts"),
      "utf8"
    );
    expect(src).toMatch(/export function resolveLoadBand\b/);
    expect(src).toMatch(/export function resolveDeloadRecommended\b/);
  });
});
