/**
 * Property-based guard for the Run9 MATERIALIZATION invariant (CLAUDE.md
 * recurring-mistake rule "persist every mirrored and derived field in the same
 * write"; bug `3087ac5` shipped a raceGoal written without its derived runMode).
 *
 * The locked rule: every write that SETS or CLEARS `profile.raceGoal` must
 * co-write `profile.runMode = deriveRunMode(raceGoal)`. The resolvers
 * (`setRaceGoalPatch` / `resolveRecoveryExit`) are the single materializing
 * path, and their return type makes `runMode` required — but a TYPE guarantee
 * doesn't prove the VALUE is consistent across the whole input space. D14 pins
 * specific examples; this fuzzes ~2000 generated inputs and asserts the
 * invariant holds for ALL of them, so an edge case can't slip the materialization.
 *
 * Pure + deterministic: a seeded PRNG drives generation, so a failure reproduces.
 */
import { describe, it, expect } from "vitest";
import {
  deriveRunMode,
  setRaceGoalPatch,
  resolveRecoveryExit,
  newRaceSupersedesRecovery,
  type RaceGoal,
  type RecoveryContext,
} from "../runModeResolution";

// ── Deterministic generators ────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DISTANCES = ["5k", "10k", "half", "marathon", "ultra", ""];

function genDate(rnd: () => number): string {
  const y = 2024 + Math.floor(rnd() * 6);
  const m = 1 + Math.floor(rnd() * 12);
  const d = 1 + Math.floor(rnd() * 28);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A RaceGoal, or null/undefined (~1/4 of the time each absent variant). */
function genRaceGoal(rnd: () => number): RaceGoal | null | undefined {
  const r = rnd();
  if (r < 0.15) return null;
  if (r < 0.25) return undefined;
  return {
    distance: DISTANCES[Math.floor(rnd() * DISTANCES.length)],
    targetDate: genDate(rnd),
  };
}

describe("Run9 materialization invariant (property-based)", () => {
  it("deriveRunMode is total: always exactly 'race_prep' or 'freeform'", () => {
    const rnd = mulberry32(1);
    for (let i = 0; i < 2000; i++) {
      const g = genRaceGoal(rnd);
      const mode = deriveRunMode(g);
      expect(mode === "race_prep" || mode === "freeform").toBe(true);
      // race_prep iff a goal is present.
      expect(mode).toBe(g ? "race_prep" : "freeform");
    }
  });

  it("setRaceGoalPatch ALWAYS carries a runMode consistent with the written raceGoal", () => {
    const rnd = mulberry32(2);
    for (let i = 0; i < 2000; i++) {
      const g = genRaceGoal(rnd) ?? null; // setter takes RaceGoal | null
      const patch = setRaceGoalPatch(g);
      // The write always materializes both fields.
      expect("raceGoal" in patch).toBe(true);
      expect(patch.runMode).toBe(deriveRunMode(g));
      // And the materialized mode matches the raceGoal it co-writes.
      expect(patch.runMode).toBe(patch.raceGoal ? "race_prep" : "freeform");
    }
  });

  it("resolveRecoveryExit NEVER returns a patch without a valid runMode, and clearing ⇒ freeform", () => {
    const rnd = mulberry32(3);
    for (let i = 0; i < 2000; i++) {
      const ctx: RecoveryContext = {
        currentRaceGoal: genRaceGoal(rnd),
        completedRaceGoal: genRaceGoal(rnd),
      };
      const patch = resolveRecoveryExit(ctx);

      // 1. runMode is always present + valid.
      expect(
        patch.runMode === "race_prep" || patch.runMode === "freeform"
      ).toBe(true);

      if ("raceGoal" in patch) {
        // 2. The exit cleared the goal → it must be null AND mode freeform.
        expect(patch.raceGoal).toBeNull();
        expect(patch.runMode).toBe("freeform");
      } else {
        // 3. The goal is preserved → mode is derived from the CURRENT goal,
        //    never silently flipped.
        expect(patch.runMode).toBe(deriveRunMode(ctx.currentRaceGoal));
      }
    }
  });

  it("a superseding future race is preserved by recovery exit (never cleared), keeping race_prep", () => {
    const rnd = mulberry32(4);
    const today = "2026-06-12";
    for (let i = 0; i < 2000; i++) {
      const ctx: RecoveryContext = {
        currentRaceGoal: genRaceGoal(rnd),
        completedRaceGoal: genRaceGoal(rnd),
      };
      if (newRaceSupersedesRecovery(ctx, today)) {
        const patch = resolveRecoveryExit(ctx);
        // A superseding race must survive the exit (key omitted = preserved)
        // and stay race_prep — losing it would delete a user's set future race.
        expect("raceGoal" in patch).toBe(false);
        expect(patch.runMode).toBe("race_prep");
      }
    }
  });
});
