/**
 * `useEffectiveTargets` single-source pin (D11).
 *
 * The goal → phase → macros chain is the highest-stakes display in the app, and
 * the #1 documented nutrition drift (`e1b0296`: an editor wrote
 * `programState.goal` while macros read `profile.program.goal`). The defence is
 * structural: ONE hook (`useEffectiveTargets`) owns "what is today's calorie +
 * macro target", and every surface reads from it. The deleted `useHomeData`
 * re-derivation (a Home-local macro recompute with a "should match Food's
 * useEffectiveTargets" comment) is the failure mode this pins against.
 *
 * The day-type macro SPLITTER is `getAdjustedTargets` (phaseNutrition.ts). If it
 * is imported anywhere except the canonical hook, that caller is re-deriving the
 * day's macros independently — exactly the drift this test forbids. Settings /
 * onboarding compute & PERSIST targets via the separate `calculateTDEE` config
 * path (they write `profile.targetCalories` etc.); they never call the day
 * splitter, so they don't appear here.
 *
 * New drift fails CI. The only way to add another importer is to consciously add
 * it to `ALLOWED_SPLITTER_IMPORTERS` below — making "a second place derives
 * macros" an explicit, reviewed decision, never an accidental leak.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const srcRoot = resolve(repoRoot, "src");

/** The macro splitter — the function that turns a goal + day type into a
 *  protein/carb/fat split. The thing that must only be called in one place. */
const SPLITTER = "getAdjustedTargets";

/** Files allowed to import the splitter:
 *  - the canonical hook (the single source of truth), and
 *  - the module that DEFINES it. */
const ALLOWED_SPLITTER_IMPORTERS = new Set<string>([
  "src/hooks/useEffectiveTargets.ts",
  "src/lib/phaseNutrition.ts",
]);

/** Walk every .ts/.tsx under src, skipping tests + node_modules. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (/\.test\.tsx?$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

describe("useEffectiveTargets single-source (D11)", () => {
  it("the day-type macro splitter is imported only by the canonical hook", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      const rel = relative(repoRoot, file);
      if (ALLOWED_SPLITTER_IMPORTERS.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      // Match an ES import that pulls in the splitter by name (named import,
      // possibly aliased). A bare mention in a comment/string won't match the
      // `import { ... } from` shape.
      const importsSplitter = new RegExp(
        `import\\s*\\{[^}]*\\b${SPLITTER}\\b[^}]*\\}\\s*from`
      ).test(src);
      if (importsSplitter) offenders.push(rel);
    }
    expect(
      offenders,
      `These files import ${SPLITTER} directly, re-deriving the day's macros ` +
        `instead of reading useEffectiveTargets. Route the display through the ` +
        `hook, or (if genuinely a new derivation source) add the file to ` +
        `ALLOWED_SPLITTER_IMPORTERS with a justification.\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("the allow-list itself is honest — every listed file exists and imports the splitter", () => {
    // A stale allow-list entry (file renamed/deleted, or no longer importing the
    // splitter) silently widens the guard. Pin that the exceptions are real.
    for (const rel of ALLOWED_SPLITTER_IMPORTERS) {
      const src = readFileSync(resolve(repoRoot, rel), "utf8");
      const mentionsSplitter = new RegExp(`\\b${SPLITTER}\\b`).test(src);
      expect(
        mentionsSplitter,
        `${rel} is allow-listed as a ${SPLITTER} site but no longer references ` +
          `it — remove it from ALLOWED_SPLITTER_IMPORTERS.`
      ).toBe(true);
    }
  });

  it("exactly one consumer hook owns the splitter (not split across hooks)", () => {
    // The whole point is ONE hook. If a second hook ever imports the splitter,
    // the "single source" claim is false even if both are allow-listed.
    const hookImporters = [...ALLOWED_SPLITTER_IMPORTERS].filter((f) =>
      f.startsWith("src/hooks/")
    );
    expect(hookImporters).toEqual(["src/hooks/useEffectiveTargets.ts"]);
  });
});
