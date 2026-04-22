import { describe, it, expect } from "vitest";
import { PROGRAM_TEMPLATES } from "../templates";
import { applyInjuryFilters } from "../matchTemplate";

/**
 * Guardrail: every template × every non-empty subset of the 5 supported
 * injury categories must produce a valid program — no duplicate
 * exercises on a single day, no exercises the filter left untouched
 * despite being contraindicated for the user, and no exercises left
 * in a tier-4 "no safe substitute" unresolved state.
 *
 * 2^5 - 1 = 31 injury combos × 11 templates = 341 cases. Any user in
 * the wild can click any combination of cards on the onboarding
 * injury step, and every one must produce a valid program.
 */
const ALL_INJURIES = ["knee", "shoulder", "lower_back", "wrist", "elbow"] as const;
const combos: readonly (readonly string[])[] = (() => {
  const out: string[][] = [];
  const n = ALL_INJURIES.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const combo: string[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) combo.push(ALL_INJURIES[i]);
    out.push(combo);
  }
  return out;
})();

describe("injury filter — full coverage", () => {
  for (const t of PROGRAM_TEMPLATES) {
    for (const combo of combos) {
      it(`${t.id} × [${combo.join("+")}] produces no duplicates / unresolved / untouched-contra`, () => {
        const filtered = applyInjuryFilters(t, [...combo], PROGRAM_TEMPLATES);
        const issues: string[] = [];

        for (const week of filtered.weeks) {
          for (const day of week.days) {
            if (day.type !== "lift") continue;

            // Duplicates on a day
            const ids = day.exercises.map((e) => e.exerciseId);
            const counts = new Map<string, number>();
            for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
            for (const [id, n] of counts) {
              if (n > 1) issues.push(`DUP ${day.name} → ${id} x${n}`);
            }

            // Stale contra flags + unresolved tier-4 warnings
            for (const ex of day.exercises) {
              const hit = (ex.contraindicated ?? []).filter((c) => combo.includes(c));
              if (!hit.length) continue;
              const swapped = ex.notes?.startsWith("Swapped from");
              const unresolved = ex.notes?.startsWith("No safe substitute");
              if (unresolved) {
                issues.push(`UNRESOLVED ${day.name} → ${ex.name}`);
              } else if (!swapped) {
                issues.push(`UNTOUCHED_CONTRA ${day.name} → ${ex.name} [${hit.join(",")}]`);
              }
            }
          }
        }

        expect(issues).toEqual([]);
      });
    }
  }
});
