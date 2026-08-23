import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";
import { isActiveMealDoc, activeMealDocs } from "../mealTotals";
import { createRequire } from "node:module";

/**
 * HOME-MEALS-01 single-source pin.
 *
 * Deletion is SOFT, so "does this meal count?" is a real rule, and it had
 * SEVEN readers of the meals collection against ONE reachable owner:
 * `sumMealTotals` took `Meal[]`, and five readers work from raw snapshots
 * they never materialise into `Meal[]`. They could not cross that seam
 * even in principle, so four of them counted deleted meals and two more
 * hand-copied the rule.
 *
 * The expensive one was the adaptive-TDEE estimator: a corrected meal's
 * calories stayed in `avgIntake`, the minuend of
 * `learnedTDEE = avgIntake − slope×7700`, so every correction nudged the
 * user's own calorie target UP. Silent, and in the direction that makes
 * them eat more.
 *
 * This is the `effectiveTargetsSingleSource` idiom applied to the meal
 * boundary: the structural defence that kept the macro splitter from
 * drifting while the calorie side grew three resolvers. A new hand-written
 * copy of the rule fails CI; the only way to add one is to put it in the
 * allowlist below, which makes "a second place decides what counts" an
 * explicit decision rather than an accident.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const srcRoot = resolve(repoRoot, "src");

/** Files allowed to test `deletedAt` directly, each for a stated reason. */
const ALLOWED_RAW_RULE = new Map<string, string>([
  ["src/lib/mealTotals.ts", "defines the rule"],
  [
    "src/hooks/useMeals.ts",
    "the archive's complement — 'what can I restore?' is a different question from 'what counts', and the pair is commented as one decision",
  ],
]);

/* `src/lib/export.ts` reads the collection and deliberately does NOT test
   the field: a data export is the user's whole record. It therefore never
   hand-writes the rule and needs no exemption — which the honesty check
   below proved by rejecting it when it was listed here speculatively. */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Strip comments so prose ABOUT the rule doesn't read as an instance of it. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("HOME-MEALS-01 — one owner for 'does this meal count?'", () => {
  it("nothing hand-writes the soft-delete rule outside the allowlist", () => {
    const offenders: string[] = [];
    for (const file of walk(srcRoot)) {
      const rel = relative(repoRoot, file);
      if (ALLOWED_RAW_RULE.has(rel)) continue;
      const code = stripComments(readFileSync(file, "utf8"));
      // A truthiness test on the field — `!m.deletedAt`, `m.deletedAt ?`,
      // `if (raw.deletedAt)`, `.filter(m => !m.deletedAt)`. Declaring the
      // field in a type or passing it through does NOT match.
      if (/[!(?]\s*\w+\.deletedAt\b|\w+\.deletedAt\s*\)/.test(code)) {
        offenders.push(rel);
      }
    }
    expect(
      offenders,
      "hand-written soft-delete rule — call isActiveMealDoc / activeMealDocs " +
        "from @/lib/mealTotals instead. If this site genuinely asks a " +
        "different question (e.g. the restore archive), add it to " +
        "ALLOWED_RAW_RULE with the reason:\n" +
        offenders.join("\n")
    ).toEqual([]);
  });

  it("the allowlist stays honest — every entry still hand-writes the rule", () => {
    // A stale exemption is a hole: the file gets refactored onto the
    // boundary and the blanket permission stays behind for the next edit.
    for (const rel of ALLOWED_RAW_RULE.keys()) {
      const code = stripComments(readFileSync(resolve(repoRoot, rel), "utf8"));
      expect(
        /deletedAt/.test(code),
        `${rel} is allowlisted but no longer references deletedAt — remove it`
      ).toBe(true);
    }
  });

  it("null means restored, not deleted — the case a truthiness flip gets wrong", () => {
    // `deletedAt: null` is what the RESTORE write leaves behind. A rule
    // written as `"deletedAt" in doc` or `doc.deletedAt !== undefined`
    // would drop restored meals; both are plausible mistakes.
    expect(isActiveMealDoc({ deletedAt: null })).toBe(true);
    expect(isActiveMealDoc({})).toBe(true);
    expect(isActiveMealDoc({ deletedAt: "2026-08-22T10:00:00Z" })).toBe(false);
  });

  it("activeMealDocs preserves the caller's own document shape", () => {
    // Generic on purpose: useStreaks carries `items` / `createdAt` that the
    // boundary knows nothing about. A normalising return type would have
    // forced it back onto a raw path — which is how the bypass happened.
    const rows = [
      { date: "2026-08-20", items: ["a"], totalCalories: 500 },
      { date: "2026-08-21", items: ["b"], totalCalories: 600, deletedAt: 1 },
    ];
    const active = activeMealDocs(rows);
    expect(active).toHaveLength(1);
    expect(active[0].items).toEqual(["a"]);
  });

  it("the server mirror agrees, including on the restore value", () => {
    // ADR-0008: pin the copy that RUNS. functions/lib/mealDocs.js is what
    // the PI adherence pass calls; drift there silently rescores users.
    const require_ = createRequire(import.meta.url);
    const server = require_(resolve(repoRoot, "functions/lib/mealDocs.js")) as {
      isActiveMealDoc: (d: unknown) => boolean;
    };

    const fixtures: unknown[] = [
      {},
      { deletedAt: null },
      { deletedAt: undefined },
      { deletedAt: "2026-08-22T10:00:00Z" },
      { deletedAt: 0 },
      { deletedAt: 1 },
      { date: "2026-08-20", totalCalories: 500 },
    ];
    for (const f of fixtures) {
      expect(
        server.isActiveMealDoc(f),
        `server/client disagree on ${JSON.stringify(f)}`
      ).toBe(isActiveMealDoc(f as { deletedAt?: unknown }));
    }
    // The server copy additionally guards a null/undefined document, which
    // the client's typed signature makes unreachable.
    expect(server.isActiveMealDoc(null)).toBe(true);
  });
});
