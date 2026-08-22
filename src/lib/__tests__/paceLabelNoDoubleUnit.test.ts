import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";
import { paceLabel } from "../runLabels";

/**
 * `paceLabel` is unit-INCLUSIVE. Appending the unit again prints it twice.
 *
 * The 10K race-pace tile in Settings read **"5:34/km/km"** — shipped, on a
 * surface a user reaches in two taps. `RunFitnessSection` composed
 * `paceLabel(value, unit)` with `paceUnitLabel(unit)`, and `paceLabel`
 * (runLabels.ts:66) already ends in `paceUnitLabel(unit)`.
 *
 * Two assertions, because the interesting one is not the arithmetic. The
 * first pins the helper's contract — that it OWNS the unit — so a future
 * change making it unit-less has to face the call sites. The second scans
 * for the composition that produced the bug, because a doubled unit is
 * invisible to types, to lint, and to every existing test: both halves are
 * strings and concatenation of two correct strings is a correct string.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const srcRoot = resolve(repoRoot, "src");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...tsxFiles(full));
      continue;
    }
    if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("paceLabel — the unit belongs to the helper", () => {
  it("includes the unit, so callers must not add one", () => {
    expect(paceLabel(334, "km")).toBe("5:34/km");
    expect(paceLabel(334, "km")).toMatch(/\/km$/);
  });

  it("returns an em dash for a missing pace, with no unit glued on", () => {
    // The branch a caller is most likely to concatenate onto blindly.
    expect(paceLabel(0, "km")).toBe("—");
  });

  it("nothing composes it with paceUnitLabel", () => {
    // The exact shape that shipped "5:34/km/km". Types cannot see it —
    // both halves are strings, and joining two correct strings yields a
    // correct string.
    const offenders: string[] = [];
    for (const f of tsxFiles(srcRoot)) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(
        /paceLabel\([^)]*\)\}?\s*\$\{?\s*paceUnitLabel\(/g
      )) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${relative(repoRoot, f)}:${line}`);
      }
    }
    expect(
      offenders,
      "`paceLabel` already ends in the unit — appending `paceUnitLabel` " +
        'prints it twice, which is what put "5:34/km/km" on the Settings ' +
        "race-pace tile."
    ).toEqual([]);
  });
});
