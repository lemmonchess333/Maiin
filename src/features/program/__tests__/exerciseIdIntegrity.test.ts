import { describe, it, expect } from "vitest";
import { PROGRAM_TEMPLATES } from "../templates";
import { INJURY_SUBSTITUTIONS } from "../injurySubstitutions";
import { EXERCISES } from "@/lib/exercises";

/**
 * Guardrail: every exerciseId referenced anywhere in the program
 * engine must resolve to a real entry in the EXERCISES database.
 *
 * History: pre-fix, templates referenced 17 distinct broken IDs
 * (`barbell-squat` when real id was `squat`, `leg-curl` when real
 * was `seated-leg-curl`, `dip` when real was `dips`, and so on).
 * MET / calorie estimation, demo links, the 1RM estimator, and the
 * injury substitution lookup all silently no-op'd for those
 * exercises.
 *
 * Scope:
 *   1. template exerciseIds
 *   2. template alternatives (by display name — must match an
 *      EXERCISES.name so `altClearsInjuries` can look them up)
 *   3. INJURY_SUBSTITUTIONS keys (original ids — swap won't fire
 *      if the key doesn't match a real template exercise)
 *   4. INJURY_SUBSTITUTIONS candidate ids
 */
describe("exercise id integrity", () => {
  const idSet = new Set(EXERCISES.map((e) => e.id));
  const nameSet = new Set(EXERCISES.map((e) => e.name.toLowerCase()));

  it("every template exerciseId resolves to an EXERCISES entry", () => {
    const bad: string[] = [];
    for (const template of PROGRAM_TEMPLATES) {
      for (const week of template.weeks) {
        for (const day of week.days) {
          for (const ex of day.exercises) {
            if (!idSet.has(ex.exerciseId)) {
              bad.push(`${template.id}/${day.name}/${ex.name} → "${ex.exerciseId}"`);
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("every template alt display name resolves to an EXERCISES.name", () => {
    const bad: string[] = [];
    for (const template of PROGRAM_TEMPLATES) {
      for (const week of template.weeks) {
        for (const day of week.days) {
          for (const ex of day.exercises) {
            for (const alt of ex.alternatives ?? []) {
              if (!nameSet.has(alt.toLowerCase())) {
                bad.push(`${template.id}/${day.name}/${ex.name} alt → "${alt}"`);
              }
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
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
