import { describe, expect, it } from "vitest";

import { applyProgression, applySessionSets } from "../programEngine";
import type { ProgramExercise } from "../programTypes";
import {
  isSetEligibleForProgression,
  isSetEligibleForStrengthPr,
} from "../sessionSetPolicy";
import { readSessionSets } from "../sessionSets";

describe("isSetEligibleForStrengthPr", () => {
  it("rejects warm-ups so they cannot create phantom rep PRs", () => {
    expect(isSetEligibleForStrengthPr("warmup", undefined)).toBe(false);
  });

  it("rejects duration-based holds from repetition and volume PR buckets", () => {
    expect(isSetEligibleForStrengthPr("working", "seconds")).toBe(false);
  });

  it("keeps ordinary working sets eligible", () => {
    expect(isSetEligibleForStrengthPr("working", undefined)).toBe(true);
  });
});

describe("isSetEligibleForProgression", () => {
  it("rejects a drop set — the whole point of the predicate", () => {
    // A drop set is deliberately lighter, and `applyProgression` moves the
    // plan to the load lifted, so letting it drive would drop the plan to
    // the drop set's load every session.
    expect(isSetEligibleForProgression("dropset")).toBe(false);
  });

  it("rejects a warm-up", () => {
    expect(isSetEligibleForProgression("warmup")).toBe(false);
  });

  it("accepts a working set", () => {
    expect(isSetEligibleForProgression("working")).toBe(true);
  });

  it("accepts a set taken to failure — it is a working set, not a miss", () => {
    // Schoenfeld p.131 endorses failure on the last set of an exercise. The
    // tag records how the set ended, not that the prescription was missed.
    expect(isSetEligibleForProgression("failure")).toBe(true);
  });

  /* ─── the two predicates are NOT interchangeable ───────────────
     Worth pinning explicitly, because the near-miss is what made
     this bug survive review: the PR predicate already existed,
     already sat twenty lines above the progression call, and
     looked like the obvious thing to reuse — but it admits a drop
     set, so reusing it would have shipped a fix that fixed
     nothing. ── */
  it("disagrees with the PR predicate exactly where it matters", () => {
    expect(isSetEligibleForStrengthPr("dropset", undefined)).toBe(true);
    expect(isSetEligibleForProgression("dropset")).toBe(false);

    // …and in the other direction: a timed hold is barred from rep-max PR
    // buckets but progresses fine on the engine's dedicated +5s axis.
    expect(isSetEligibleForStrengthPr("working", "seconds")).toBe(false);
    expect(isSetEligibleForProgression("working")).toBe(true);
  });
});

/* ─── D3 · the consequence, driven through the real engine ──────────────
   The predicate tests above are necessary but not sufficient: they prove the
   rule, not that the rule is applied to the thing that matters. This drives
   the actual `applyProgression` over a realistic session pattern — three
   working sets on target, then a drop set — and pins that the lifter's load
   survives it.

   Pre-fix, `WorkoutSession` handed the LAST set to `applyProgression`
   regardless of type, so this exact (textbook) pattern scored
   `actualWeight >= exercise.weight` false every session,
   `consecutiveFailures` reached 3, and the backoff cut the load 5%. Then it
   reset the counter and did it again. A lifter using drop sets was walked
   down indefinitely for training correctly. ── */
describe("readSessionSets → applySessionSets (D3)", () => {
  const mkEx = (over: Partial<ProgramExercise> = {}): ProgramExercise => ({
    name: "Bench Press",
    exerciseId: "bench-press",
    movementCategory: "horizontal_push",
    sets: 4,
    reps: 8,
    baseReps: 8,
    repRangeMax: 10,
    baseSets: 4,
    weight: 100,
    progressionType: "double",
    lastSuccessfulWeight: 100,
    lastAttemptedWeight: 100,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    isAccessory: false,
    ...over,
  });

  /** Three working sets that hit the target, then a lighter drop set. */
  const sessionEndingInADropSet = () => [
    { completed: true, type: "working", reps: 8, weight: 100 },
    { completed: true, type: "working", reps: 8, weight: 100 },
    { completed: true, type: "working", reps: 8, weight: 100 },
    { completed: true, type: "dropset", reps: 12, weight: 60 },
  ];

  it("reads the WORKING sets, not the trailing drop set", () => {
    expect(readSessionSets(sessionEndingInADropSet(), 4)).toEqual({
      weight: 100,
      counted: [
        { weight: 100, reps: 8 },
        { weight: 100, reps: 8 },
        { weight: 100, reps: 8 },
      ],
    });
  });

  /**
   * Six sessions of a lifter who hits whatever the current rep target is —
   * i.e. someone progressing normally through the 8–10 double-progression
   * range. `withDropSet` appends a lighter finisher; nothing else differs.
   */
  const runSessions = (withDropSet: boolean): ProgramExercise => {
    let ex = mkEx();
    for (let session = 0; session < 6; session++) {
      const sets = [
        { completed: true, type: "working", reps: ex.reps, weight: ex.weight },
        { completed: true, type: "working", reps: ex.reps, weight: ex.weight },
        { completed: true, type: "working", reps: ex.reps, weight: ex.weight },
        ...(withDropSet
          ? [{ completed: true, type: "dropset", reps: 12, weight: 60 }]
          : []),
      ];
      ex = applySessionSets(ex, readSessionSets(sets, ex.sets)!, false);
    }
    return ex;
  };

  it("a trailing drop set is inert — six sessions land identically", () => {
    // The sharpest statement of the fix: adding a drop set to a session
    // changes NOTHING about progression. Robust to whatever the engine does
    // internally, so it cannot drift into vacuity as the engine evolves.
    const withDrop = runSessions(true);
    const withoutDrop = runSessions(false);
    expect(withDrop.weight).toBe(withoutDrop.weight);
    expect(withDrop.reps).toBe(withoutDrop.reps);
    expect(withDrop.consecutiveFailures).toBe(withoutDrop.consecutiveFailures);
    // …and the lifter actually went somewhere, so this is not two zeroes.
    expect(withDrop.weight).toBeGreaterThan(100);
  });

  it("…while the pre-fix selection drags the lift down to the drop set", () => {
    // Not shipped behaviour — proof the fixture can trigger the defect, so
    // the assertion above is not vacuous. Feeding the raw last set (the drop
    // set) used to fail `actualWeight >= exercise.weight` every time and walk
    // the load down 5% every third session. Now that the plan follows the
    // load lifted (owner, 2026-10-05), the same wrong selection moves the
    // prescription straight to the drop set's 60 kg, a step on (12 reps tops
    // the 8-10 range), while the correct selection climbed past 100 kg.
    // Either way the selection is what keeps the lifter's load.
    let ex = mkEx();
    for (let session = 0; session < 6; session++) {
      ex = applyProgression(ex, 12, 60, false);
    }
    expect(ex.weight).toBe(62.5);
    expect(ex.reps).toBe(mkEx().reps);
    expect(ex.consecutiveFailures).toBe(0);
  });

  it("skips progression when nothing eligible was completed", () => {
    expect(
      readSessionSets(
        [
          { completed: true, type: "warmup", reps: 5, weight: 40 },
          { completed: false, type: "working", reps: 8, weight: 100 },
        ],
        4
      )
    ).toBeNull();
  });

  it("ignores an incomplete trailing set", () => {
    expect(
      readSessionSets(
        [
          { completed: true, type: "working", reps: 8, weight: 100 },
          { completed: false, type: "working", reps: 0, weight: 100 },
        ],
        4
      )?.counted
    ).toEqual([{ weight: 100, reps: 8 }]);
  });
});
