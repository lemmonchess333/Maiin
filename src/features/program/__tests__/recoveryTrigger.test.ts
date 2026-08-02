/**
 * Evidence-triggered recovery (14b).
 *
 * The rule replaces nothing — the `week % 4 === 0` deload still runs — it adds
 * a tier that fires on measured regression instead of the calendar. So the
 * tests come in three groups:
 *
 *  1. **The signal is the right fact.** Regression against the lifter's own
 *     previous session, once a heavier bar and a lighter prescription are
 *     ruled out — NOT missing a target, which `plateauCount` already owns.
 *     Getting this wrong would make the tier a second reading of a fact the
 *     engine already acts on, and the first draft got the load comparison
 *     backwards: its own doc comment said "exclude a heavier bar" while the
 *     code required one. The test below is what found it.
 *  2. **The escalation ladder is muscle-local first.** A whole-body light week
 *     for one fatigued muscle throws away the other muscles' training
 *     (Zatsiorsky p.81).
 *  3. **It cannot compound, and it cannot oscillate.** The two ways a
 *     self-restoring cut goes wrong, and the reason `recoveringMuscles` is
 *     persisted at all.
 */
import { describe, it, expect } from "vitest";

import { advanceWeek } from "../programEngine";
import {
  applyRecoverySession,
  escalatesToWholeBody,
  liftAtMrv,
  musclesAtMrv,
  recoveryTargets,
  underperformingStreak,
} from "../recoveryTrigger";
import type {
  PerformanceRecord,
  ProgramExercise,
  ProgramState,
  WorkoutDay,
} from "../programTypes";

const rec = (
  weight: number,
  repsCompleted: number,
  repsTarget = 8
): PerformanceRecord => ({
  date: "2026-03-01",
  weight,
  repsCompleted,
  repsTarget,
});

function ex(overrides: Partial<ProgramExercise>): ProgramExercise {
  return {
    name: "X",
    exerciseId: "bench-press",
    movementCategory: "horizontal_push",
    sets: 4,
    reps: 8,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}

const day = (exercises: ProgramExercise[], over: Partial<WorkoutDay> = {}) =>
  ({
    dayName: "D",
    dayType: "upper",
    completed: false,
    exercises,
    ...over,
  }) as WorkoutDay;

describe("underperformingStreak — the signal", () => {
  it("counts consecutive regressions at the same load", () => {
    // Zatsiorsky p.75's own example: 5 reps at 220, then fewer, twice.
    expect(underperformingStreak([rec(220, 5), rec(220, 4), rec(220, 2)])).toBe(
      2
    );
  });

  it("stops at the first session that held or improved", () => {
    expect(underperformingStreak([rec(100, 8), rec(100, 5), rec(100, 6)])).toBe(
      0
    );
    expect(underperformingStreak([rec(100, 5), rec(100, 8), rec(100, 6)])).toBe(
      1
    );
  });

  it("does NOT count fewer reps on a heavier bar", () => {
    // The most important negative. A load increase normally costs reps — that
    // is a successful progression step, not fatigue. Counting it would fire
    // recovery sessions at exactly the lifters progressing fastest.
    expect(underperformingStreak([rec(100, 8), rec(105, 6), rec(110, 5)])).toBe(
      0
    );
  });

  it("does NOT count the app's own deload week as fatigue", () => {
    // The post-novice deload recipe HOLDS load and cuts the rep target by two
    // (Helms p65-66's 3x10x200 -> 2x8x200). A compliant lifter therefore
    // records fewer reps at the same weight — indistinguishable from
    // regression unless the target is consulted. Without this rule-out, every
    // deload week would manufacture the MRV signal it is the response to.
    expect(underperformingStreak([rec(200, 10, 10), rec(200, 8, 8)])).toBe(0);
    // The novice recipe cuts LOAD and holds reps, so a compliant lifter's
    // rep count is unchanged and there is nothing to exclude.
    expect(underperformingStreak([rec(200, 10, 10), rec(170, 10, 10)])).toBe(0);
    // …and coming back OUT of the deload is not a regression either.
    expect(underperformingStreak([rec(200, 8, 8), rec(200, 10, 10)])).toBe(0);
  });

  it("is about regression, not about missing the target", () => {
    // Every session BELOW target but climbing: the engine's plateau machinery
    // owns this case, and reading it here too would be the same fact twice.
    const climbing = [rec(100, 3, 8), rec(100, 4, 8), rec(100, 5, 8)];
    expect(underperformingStreak(climbing)).toBe(0);
    // …and the converse: every session AT target while regressing is invisible
    // to `plateauCount` and visible here.
    const sliding = [rec(100, 9, 5), rec(100, 7, 5), rec(100, 6, 5)];
    expect(underperformingStreak(sliding)).toBe(2);
  });

  it("needs two records before it can say anything", () => {
    expect(underperformingStreak(undefined)).toBe(0);
    expect(underperformingStreak([])).toBe(0);
    expect(underperformingStreak([rec(100, 3)])).toBe(0);
  });

  it("fires at exactly two, per RP Ch3 P154", () => {
    expect(
      liftAtMrv(ex({ performanceHistory: [rec(100, 8), rec(100, 6)] }))
    ).toBe(
      false // one regression
    );
    expect(
      liftAtMrv(
        ex({ performanceHistory: [rec(100, 8), rec(100, 6), rec(100, 5)] })
      )
    ).toBe(true);
  });
});

/** Same load, same target, reps sliding — the two-session MRV signal. */
const stalling = [rec(100, 8), rec(100, 6), rec(100, 5)];

describe("musclesAtMrv — attribution", () => {
  it("credits the PRIMARY muscle only", () => {
    // A bench press regressing is a CHEST signal. Its triceps are worked at
    // half involvement, and if they are genuinely at MRV their own lifts will
    // say so — crediting them here fires recovery sessions for muscles whose
    // own work is fine.
    const { atMrv, trained } = musclesAtMrv([
      day([ex({ exerciseId: "bench-press", performanceHistory: stalling })]),
    ]);
    expect(atMrv).toEqual(["Chest"]);
    expect(trained).toEqual(["Chest"]);
  });

  it("counts every trained muscle in the denominator, fatigued or not", () => {
    const { atMrv, trained } = musclesAtMrv([
      day([
        ex({ exerciseId: "bench-press", performanceHistory: stalling }),
        ex({ exerciseId: "barbell-row", movementCategory: "horizontal_pull" }),
        ex({ exerciseId: "back-squat", movementCategory: "knee_dominant" }),
      ]),
    ]);
    expect(atMrv).toEqual(["Chest"]);
    expect(trained.sort()).toEqual(["Back", "Chest", "Quads"]);
  });

  it("ignores skipped days — no stimulus, no signal", () => {
    const { atMrv, trained } = musclesAtMrv([
      day([ex({ performanceHistory: stalling })], { skipped: true }),
    ]);
    expect(atMrv).toEqual([]);
    expect(trained).toEqual([]);
  });
});

describe("escalatesToWholeBody — RP Ch3 P209-212's 'more than half'", () => {
  it("holds at exactly half — that is not more than half", () => {
    // The boundary matters: at a tie, the muscle-local response is the one
    // that keeps the other half of the body training.
    expect(
      escalatesToWholeBody(
        ["Chest", "Back"],
        ["Chest", "Back", "Quads", "Core"]
      )
    ).toBe(false);
  });

  it("escalates past half", () => {
    expect(
      escalatesToWholeBody(
        ["Chest", "Back", "Quads"],
        ["Chest", "Back", "Quads", "Core"]
      )
    ).toBe(true);
  });

  it("never escalates on an empty week (no division by zero)", () => {
    expect(escalatesToWholeBody([], [])).toBe(false);
  });
});

describe("applyRecoverySession — RP Ch3 P202, two-factor direction", () => {
  it("halves sets and reps and HOLDS the load", () => {
    // Zatsiorsky p.13: cutting the load is the one-factor taper, and p.10
    // rejects the model it belongs to. `applyDeload` already gets this right
    // for the whole-body case; muscle scope must not invert it.
    const [out] = applyRecoverySession(
      [day([ex({ sets: 4, reps: 8, weight: 100 })])],
      ["Chest"]
    );
    expect(out.exercises[0]).toMatchObject({ sets: 2, reps: 4, weight: 100 });
  });

  it("leaves every other muscle's work untouched", () => {
    const [out] = applyRecoverySession(
      [
        day([
          ex({ exerciseId: "bench-press", sets: 4, reps: 8 }),
          ex({
            exerciseId: "barbell-row",
            movementCategory: "horizontal_pull",
            sets: 4,
            reps: 8,
          }),
        ]),
      ],
      ["Chest"]
    );
    expect(out.exercises[0].sets).toBe(2); // Chest, halved
    expect(out.exercises[1].sets).toBe(4); // Back, full week
  });

  it("stashes reps and anchors sets so the cut cannot compound", () => {
    // The D4 hazard, at muscle scope: a cut with no stash decays the
    // prescription every time it fires. `applyWeeklyVolumeShape` restores from
    // exactly these two fields.
    const [out] = applyRecoverySession(
      [day([ex({ sets: 4, reps: 8 })])],
      ["Chest"]
    );
    expect(out.exercises[0].preDeloadReps).toBe(8);
    expect(out.exercises[0].baseSets).toBe(4);
  });

  it("halves from the ANCHOR, not from an already-cut value", () => {
    // Firing twice in a row must not produce a quarter.
    const [out] = applyRecoverySession(
      [day([ex({ sets: 2, baseSets: 4, reps: 8 })])],
      ["Chest"]
    );
    expect(out.exercises[0].sets).toBe(2);
  });

  it("never removes the movement entirely", () => {
    const [out] = applyRecoverySession(
      [day([ex({ sets: 1, reps: 1 })])],
      ["Chest"]
    );
    expect(out.exercises[0].sets).toBe(1);
    expect(out.exercises[0].reps).toBe(1);
  });

  it("is a no-op with no targets, and does not mutate its input", () => {
    const input = [day([ex({ sets: 4 })])];
    const out = applyRecoverySession(input, []);
    expect(out[0].exercises[0].sets).toBe(4);
    applyRecoverySession(input, ["Chest"]);
    expect(input[0].exercises[0].sets).toBe(4);
  });
});

describe("recoveryTargets — the refractory period", () => {
  it("excludes a muscle that is still re-entering", () => {
    expect(recoveryTargets(["Chest", "Back"], ["Chest"])).toEqual(["Back"]);
  });

  it("passes everything through when nothing is re-entering", () => {
    expect(recoveryTargets(["Chest"], undefined)).toEqual(["Chest"]);
    expect(recoveryTargets(["Chest"], [])).toEqual(["Chest"]);
  });
});

/* ─── The tier inside `advanceWeek` ──────────────────────────────────────
   The unit rules above are only worth having if the week the user actually
   receives changes. These drive the real rollover. ── */
describe("advanceWeek — the evidence tier", () => {
  const state = (workouts: WorkoutDay[], over: Partial<ProgramState> = {}) =>
    ({
      weekNumber: 1,
      splitType: "upper_lower",
      workouts,
      ...over,
    }) as ProgramState;

  it("cuts the fatigued muscle and records it as re-entering", () => {
    const next = advanceWeek(
      state([
        day([
          ex({
            exerciseId: "bench-press",
            performanceHistory: stalling,
            sets: 4,
            baseSets: 4,
          }),
          ex({
            exerciseId: "barbell-row",
            movementCategory: "horizontal_pull",
            sets: 4,
            baseSets: 4,
          }),
        ]),
      ]),
      "intermediate"
    );
    expect(next.recoveringMuscles).toEqual(["Chest"]);
    expect(next.workouts[0].exercises[0].sets).toBeLessThan(4);
    expect(next.workouts[0].exercises[1].sets).toBe(4); // Back untouched
  });

  it("does not fire twice for the same muscle — the oscillation guard", () => {
    // The muscle is STILL showing the signal (its history hasn't changed), so
    // without the refractory list it would be cut again the moment it was
    // restored, forever.
    const next = advanceWeek(
      state(
        [
          day([
            ex({
              exerciseId: "bench-press",
              performanceHistory: stalling,
              sets: 4,
              baseSets: 4,
            }),
          ]),
        ],
        { recoveringMuscles: ["Chest"] }
      ),
      "intermediate"
    );
    expect(next.workouts[0].exercises[0].sets).toBe(4); // restored, not re-cut
    expect(next.recoveringMuscles).toEqual([]); // and released
  });

  it("escalates to a whole-body deload past half the trained muscles", () => {
    const stalled = (id: string, cat: string) =>
      ex({
        exerciseId: id,
        movementCategory: cat as ProgramExercise["movementCategory"],
        performanceHistory: stalling,
        sets: 4,
        baseSets: 4,
      });
    const next = advanceWeek(
      state([
        day([
          stalled("bench-press", "horizontal_push"), // Chest
          stalled("barbell-row", "horizontal_pull"), // Back
          ex({
            exerciseId: "back-squat",
            movementCategory: "knee_dominant",
            sets: 4,
            baseSets: 4,
          }), // Quads, fine
        ]),
      ]),
      "intermediate"
    );
    // 2 of 3 trained muscles > half → whole-body. Every lift is cut, including
    // the quads whose own work was fine.
    for (const e of next.workouts[0].exercises) expect(e.sets).toBeLessThan(4);
    // …and the escalated path leaves no refractory list: `applyDeload` is its
    // own restore cycle via preDeloadWeight/preDeloadReps.
    expect(next.recoveringMuscles).toBeUndefined();
  });

  it("leaves a healthy week completely alone", () => {
    const next = advanceWeek(
      state([
        day([
          ex({
            exerciseId: "bench-press",
            performanceHistory: [rec(100, 6), rec(100, 8)],
            sets: 4,
            baseSets: 4,
          }),
        ]),
      ]),
      "intermediate"
    );
    expect(next.recoveringMuscles).toBeUndefined();
    expect(next.workouts[0].exercises[0].sets).toBe(4);
  });

  it("cannot fire on a freshly generated plan — which is why the sweep is unmoved", () => {
    // The 90-config golden fixture builds plans with no performance history at
    // all, so this tier is inert there BY CONSTRUCTION rather than by luck.
    // Stating it here means a future change that made the trigger read
    // something a fresh plan HAS would fail with a reason attached.
    const fresh = musclesAtMrv([day([ex({ performanceHistory: [] })])]);
    expect(fresh.atMrv).toEqual([]);
    expect(fresh.trained).toEqual(["Chest"]);
  });
});
