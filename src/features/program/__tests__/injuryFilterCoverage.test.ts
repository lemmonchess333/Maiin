import { describe, it, expect } from "vitest";
import { PROGRAM_TEMPLATES } from "../templates";
import { applyInjuryFilters } from "../matchTemplate";

/**
 * Guardrail: every template × every injury combination must produce
 * a valid program — no duplicate exercises on a single day, no
 * exercises the filter left untouched despite being contraindicated
 * for the user, and no exercises left in a tier-4 "no safe substitute"
 * unresolved state.
 *
 * The 17-broken-id cleanup plus the dedup fix plus the expanded
 * leg-extension substitute list bring this count to zero. If it
 * rises again, the test output surfaces exactly which combination
 * regressed.
 */
const combos: readonly (readonly string[])[] = [
  ["knee"],
  ["shoulder"],
  ["lower_back"],
  ["knee", "shoulder"],
  ["knee", "lower_back"],
  ["shoulder", "lower_back"],
  ["knee", "shoulder", "lower_back"],
];

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
