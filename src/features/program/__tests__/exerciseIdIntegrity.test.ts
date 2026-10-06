import { describe, it, expect } from "vitest";
import { CONTRAINDICATED, INJURY_SUBSTITUTIONS } from "../injurySubstitutions";
import { EXERCISES } from "@/lib/exercises";

/**
 * Guardrail: every exerciseId the injury tables name must resolve to a real
 * entry in the EXERCISES database.
 *
 * History: the hand-written templates once referenced 17 distinct broken
 * IDs (`barbell-squat` when the real id was `squat`, `leg-curl` when it was
 * `seated-leg-curl`, `dip` when it was `dips`, and so on), and MET / calorie
 * estimation, demo links, the 1RM estimator and the injury substitution
 * lookup all silently no-op'd for those exercises. The templates are gone
 * (Lift4 (5): one generator), and the injury tables are what's left naming
 * lifts by hand:
 *
 *   1. CONTRAINDICATED keys (a swap won't fire for an id no plan holds)
 *   2. INJURY_SUBSTITUTIONS keys
 *   3. INJURY_SUBSTITUTIONS candidate ids
 */
describe("exercise id integrity", () => {
  const idSet = new Set(EXERCISES.map((e) => e.id));

  it("every CONTRAINDICATED key resolves to an EXERCISES entry", () => {
    expect(Object.keys(CONTRAINDICATED).filter((id) => !idSet.has(id))).toEqual(
      []
    );
  });

  it("every INJURY_SUBSTITUTIONS key resolves to an EXERCISES entry", () => {
    const bad: string[] = [];
    for (const key of Object.keys(INJURY_SUBSTITUTIONS)) {
      if (!idSet.has(key)) bad.push(key);
    }
    expect(bad).toEqual([]);
  });

  it("every INJURY_SUBSTITUTIONS candidate id resolves to an EXERCISES entry", () => {
    const bad: string[] = [];
    for (const [key, candidates] of Object.entries(INJURY_SUBSTITUTIONS)) {
      for (const c of candidates) {
        if (!idSet.has(c.id)) bad.push(`${key} → ${c.id}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
