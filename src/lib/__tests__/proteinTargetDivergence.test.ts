/**
 * The stored and displayed protein targets diverge on purpose — and the
 * divergence is safe by EXACTLY one decimal place. This pins that.
 *
 * Two multipliers produce two protein targets:
 *
 *   stored `profile.targetProtein`   `proteinMultiplierForGoal` — goal only
 *   displayed daily target           `dayProteinMultiplier` — lift PHASE
 *                                    first, goal as fallback, cut pinned 2.2
 *
 * They are not a mirror pair and consolidating them was considered and
 * declined. The stored value is a phase-agnostic baseline; the displayed one
 * tracks the training block. Collapsing them would mean either a new
 * server-side phase mirror or an obligation to rewrite the profile on every
 * phase change — both larger and more drift-prone than the gap they close.
 *
 * WHAT MAKES THAT SAFE, and it is not obvious. The stored value is what the
 * server's PI protein-adherence factor scores against, while the user is
 * shown the displayed one. Scoring someone against a number they were never
 * shown is the exact failure `calorieTargetResolution.js` was written to fix
 * for calories — its header cites "the protein drift fixed in #1960, where
 * complying with the plan cost adherence".
 *
 * It is safe here only because of an arithmetic coincidence:
 *
 *   • the factor is `ratio >= 0.9 ? 100 : ratio * 111`, so over-eating is
 *     never penalised — only the shown < stored direction can hurt;
 *   • across every REACHABLE (goal, phase) pair the shown/stored ratio
 *     bottoms out at exactly 0.90, which is exactly the threshold.
 *
 * Zero margin. Any of these silently starts penalising users who ate exactly
 * what the app asked of them:
 *   - adding a phase below 1.8 to `LiftPhase` (`PHASE_PROTEIN.race_prep` is
 *     1.6 and would give 0.8 → a score of 88.8 — it is currently unreachable
 *     ONLY because `LiftPhase` has no such member);
 *   - lowering any PHASE_PROTEIN value;
 *   - raising any GOAL_PROTEIN value;
 *   - tightening the 0.9 threshold.
 *
 * None of those would fail any other test. That is why this file exists: the
 * invariant is currently accidental, and this is what makes it deliberate.
 */
import { describe, it, expect } from "vitest";
import { PHASE_PROTEIN, GOAL_PROTEIN } from "@/lib/macroConstants";
import { proteinMultiplierForGoal } from "@/lib/tdee";

/**
 * The lift phases the nutrition path can actually receive. Mirrors
 * `LiftPhase` from `trainingSignals.ts` minus "none", which falls through to
 * the goal multiplier and so can never diverge from it.
 */
const REACHABLE_PHASES = ["strength", "hypertrophy", "deload", "base"] as const;
const GOALS = ["cut", "lean bulk", "recomp"] as const;

/** The protein-adherence factor's pass threshold, from perfScoring. */
const ADHERENCE_PASS_RATIO = 0.9;

/** `dayProteinMultiplier`, restated over the reachable inputs: cut pins 2.2
 *  regardless of phase, otherwise the phase wins. */
function shownMultiplier(goal: string, phase: string): number {
  return goal === "cut" ? 2.2 : PHASE_PROTEIN[phase];
}

describe("stored vs displayed protein — the divergence never costs adherence", () => {
  it("holds for every reachable goal × phase pair", () => {
    const offenders: string[] = [];
    for (const goal of GOALS) {
      for (const phase of REACHABLE_PHASES) {
        const stored = proteinMultiplierForGoal(goal);
        const shown = shownMultiplier(goal, phase);
        // A user who eats exactly what they were SHOWN is scored against the
        // STORED figure. Below the threshold, they lose points for complying.
        if (shown / stored < ADHERENCE_PASS_RATIO) {
          offenders.push(
            `${goal}/${phase}: shown ${shown} vs stored ${stored} = ${(
              shown / stored
            ).toFixed(3)}`
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has ZERO margin — the worst pair sits exactly on the threshold", () => {
    // Stated as its own assertion because the test above would keep passing
    // if the margin quietly grew or shrank, and the whole point of this file
    // is that there is none. recomp goal (2.0) on a deload phase (1.8).
    let worst = Infinity;
    for (const goal of GOALS) {
      for (const phase of REACHABLE_PHASES) {
        worst = Math.min(
          worst,
          shownMultiplier(goal, phase) / proteinMultiplierForGoal(goal)
        );
      }
    }
    expect(worst).toBeCloseTo(ADHERENCE_PASS_RATIO, 10);
  });

  it("names the phase that would break it if it ever became reachable", () => {
    // `race_prep` is in PHASE_PROTEIN but not in `LiftPhase`. If a future
    // change adds it — or any phase below 1.8 — a recomp user would be shown
    // 1.6 g/kg and scored against 2.0, a ratio of 0.8.
    expect(PHASE_PROTEIN.race_prep).toBe(1.6);
    expect(REACHABLE_PHASES).not.toContain("race_prep" as never);
    expect(PHASE_PROTEIN.race_prep / GOAL_PROTEIN.recomp).toBeLessThan(
      ADHERENCE_PASS_RATIO
    );
  });

  it("pins the multiplier tables the invariant rests on", () => {
    // Literals, not derived from the tables, so a value change fails HERE
    // with a readable diff rather than surfacing as an adherence regression
    // nobody traces back.
    expect(PHASE_PROTEIN.strength).toBe(2.2);
    expect(PHASE_PROTEIN.hypertrophy).toBe(2.0);
    expect(PHASE_PROTEIN.deload).toBe(1.8);
    expect(PHASE_PROTEIN.base).toBe(2.0);
    expect(GOAL_PROTEIN.cut).toBe(2.2);
    expect(GOAL_PROTEIN["lean bulk"]).toBe(1.8);
    expect(GOAL_PROTEIN.recomp).toBe(2.0);
  });
});
