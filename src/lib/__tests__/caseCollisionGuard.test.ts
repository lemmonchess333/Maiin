/**
 * No two modules in one folder of src/ may differ only in letter case.
 *
 * The iOS build runs on macOS, whose file system ignores case, and Linux,
 * where CI's unit jobs and every cloud session run, does not. With
 * `MedalArt.tsx` (the component) beside `medalArt.ts` (its definitions),
 * `import MedalArt from "./MedalArt"` found the component on Linux and
 * `medalArt.ts` on the Mac, tried as `.ts` before `.tsx`: `tsc -b` passed
 * here and failed in simulator-build with "has no default export"
 * (Soc15, 3 November). This test fails on Linux for the same pair.
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MODULE = /\.(tsx?|jsx?|mjs|css)$/;

function collisions(dir: string): string[] {
  const found: string[] = [];
  const byStem = new Map<string, Set<string>>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...collisions(join(dir, entry.name)));
      continue;
    }
    if (!MODULE.test(entry.name)) continue;
    // "Foo.test.ts" and "Foo.tsx" import as "Foo.test" and "Foo".
    const stem = entry.name.replace(MODULE, "");
    const key = stem.toLowerCase();
    const names = byStem.get(key) ?? new Set<string>();
    names.add(stem);
    byStem.set(key, names);
  }
  for (const names of byStem.values()) {
    if (names.size > 1) {
      found.push(
        `${dir.slice(SRC.length + 1)}: ${[...names].sort().join(", ")}`
      );
    }
  }
  return found;
}

describe("module names under src/", () => {
  it("never differ from a neighbour's only in case", () => {
    expect(collisions(SRC)).toEqual([]);
  });
});
