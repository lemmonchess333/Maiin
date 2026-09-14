/**
 * The plateau predicate — pinned because its false positive was expensive.
 *
 * A real device screenshot (2026-08-04) showed "Plateau detected — You've been
 * at 0kg on Overhead Press for 3 sessions" after a session where nothing had
 * ever been calibrated. The modal that copy opens offers "+150 cal", and
 * accepting writes `customCalorieTarget`, which is the manual-override flag
 * that switches adaptive TDEE OFF. So the bug did not merely nag: it invited
 * the user to disable a Pro feature on the strength of a plateau that never
 * happened.
 *
 * The old predicate joined each session's set weights into a string and
 * compared the three. For an uncalibrated lift every session reads "0,0,0" —
 * truthy, and trivially equal to itself. Nothing caught it because the logic
 * sat inline in `WorkoutSession.tsx`, which has no test file at all.
 */
import { describe, it, expect } from "vitest";

import { detectStall, type LoggedWorkout } from "../stallDetection";

/** n sessions of the same loaded prescription, newest first. */
function sessions(
  name: string,
  sets: Array<{ weightKg?: number; reps?: number }>,
  count = 3
): LoggedWorkout[] {
  return Array.from({ length: count }, () => ({
    exercises: [{ exerciseName: name, sets: sets.map((s) => ({ ...s })) }],
  }));
}

const OHP = { name: "Overhead Press", exerciseId: "overhead-press" };
const PULLUPS = { name: "Pull-Ups", exerciseId: "pull-ups" };

describe("detectStall — the uncalibrated false positive", () => {
  it("does NOT fire on a loaded lift that has never carried weight", () => {
    // The exact production case: three sessions of Overhead Press logged at
    // 0 kg because the slot was never seeded. Pre-fix this returned a stall.
    const history = sessions("Overhead Press", [
      { weightKg: 0, reps: 12 },
      { weightKg: 0, reps: 12 },
    ]);
    expect(detectStall(OHP, history)).toBeNull();
  });

  it("still fires on a genuinely stalled loaded lift", () => {
    // The positive case, so the guard above can't pass by disabling the
    // feature outright.
    const history = sessions("Overhead Press", [
      { weightKg: 40, reps: 8 },
      { weightKg: 40, reps: 8 },
    ]);
    const stall = detectStall(OHP, history);
    expect(stall).not.toBeNull();
    expect(stall?.weight).toBe(40);
    expect(stall?.isBodyweight).toBe(false);
  });

  it("does not infer complete repeated work from zero-rep placeholders", () => {
    const history = sessions("Overhead Press", [
      { weightKg: 40, reps: 8 },
      { weightKg: 0, reps: 0 },
    ]);
    expect(detectStall(OHP, history)).toBeNull();
  });
});

describe("detectStall — bodyweight performance", () => {
  it("does not call a rep-progressing pull-up a stall", () => {
    // 0 kg every session is CORRECT for a pull-up, and the old weight-series
    // comparison would have called this a plateau while the user added reps.
    const history: LoggedWorkout[] = [
      {
        exercises: [
          { exerciseName: "Pull-Ups", sets: [{ weightKg: 0, reps: 10 }] },
        ],
      },
      {
        exercises: [
          { exerciseName: "Pull-Ups", sets: [{ weightKg: 0, reps: 9 }] },
        ],
      },
      {
        exercises: [
          { exerciseName: "Pull-Ups", sets: [{ weightKg: 0, reps: 8 }] },
        ],
      },
    ];
    expect(detectStall(PULLUPS, history)).toBeNull();
  });

  it("does fire when the reps themselves hold flat", () => {
    const history = sessions("Pull-Ups", [{ weightKg: 0, reps: 8 }]);
    const stall = detectStall(PULLUPS, history);
    expect(stall).not.toBeNull();
    expect(stall?.isBodyweight).toBe(true);
    // The caller uses this to avoid rendering "at 0kg" for a bodyweight lift.
    expect(stall?.weight).toBe(0);
  });
});

describe("detectStall — the ordinary gates", () => {
  it("needs three logged sessions", () => {
    const history = sessions("Overhead Press", [{ weightKg: 40, reps: 8 }], 2);
    expect(detectStall(OHP, history)).toBeNull();
  });

  it("ignores sessions that do not contain the lift", () => {
    const history: LoggedWorkout[] = [
      {
        exercises: [{ exerciseName: "Bench Press", sets: [{ weightKg: 60 }] }],
      },
      ...sessions("Overhead Press", [{ weightKg: 40, reps: 8 }]),
    ];
    expect(detectStall(OHP, history)).not.toBeNull();
  });

  it("does not read three set-less sessions as a stall", () => {
    // Empty series must be no-signal, not a match — otherwise a lift logged
    // with no sets at all reads as a perfect plateau.
    const history: LoggedWorkout[] = Array.from({ length: 3 }, () => ({
      exercises: [{ exerciseName: "Overhead Press", sets: [] }],
    }));
    expect(detectStall(OHP, history)).toBeNull();
  });

  it("a load change breaks the stall", () => {
    const history: LoggedWorkout[] = [
      {
        exercises: [
          {
            exerciseName: "Overhead Press",
            sets: [{ weightKg: 42.5, reps: 8 }],
          },
        ],
      },
      {
        exercises: [
          { exerciseName: "Overhead Press", sets: [{ weightKg: 40, reps: 8 }] },
        ],
      },
      {
        exercises: [
          { exerciseName: "Overhead Press", sets: [{ weightKg: 40, reps: 8 }] },
        ],
      },
    ];
    expect(detectStall(OHP, history)).toBeNull();
  });
});

describe("completed work qualifies later plateau advice", () => {
  it("recognises added reps at the same working load", () => {
    const history = [10, 9, 8].map((reps) => ({
      exercises: [{ exerciseName: OHP.name, sets: [{ weightKg: 40, reps }] }],
    }));
    expect(detectStall(OHP, history)).toBeNull();
  });
  it("recognises added load on a weighted bodyweight exercise", () => {
    const history = [10, 5, 0].map((weightKg) => ({
      exercises: [
        { exerciseName: PULLUPS.name, sets: [{ weightKg, reps: 8 }] },
      ],
    }));
    expect(detectStall(PULLUPS, history)).toBeNull();
  });
  it.each(["easier_today", "express30", "express45", "time_budget"])(
    "a chosen %s session breaks the comparison instead of reviving an older stall",
    (sessionVariant) => {
      const history = sessions(OHP.name, [{ weightKg: 40, reps: 8 }], 5);
      const interrupted = [
        { ...history[0], sessionVariant },
        ...history.slice(1),
      ];
      expect(detectStall(OHP, interrupted)).toBeNull();
    }
  );
  it("does not infer a plateau from repeated incomplete full sessions", () => {
    const history = sessions(OHP.name, [{ weightKg: 40, reps: 8 }]).map(
      (workout) => ({
        ...workout,
        exercises: workout.exercises!.map((ex) => ({
          ...ex,
          plannedSetCount: 3,
        })),
      })
    );
    expect(detectStall(OHP, history)).toBeNull();
  });
  it.each(["warmup", "dropset"])(
    "%s alone is not progression evidence",
    (type) => {
      const history = sessions(OHP.name, [{ weightKg: 40, reps: 8 }]).map(
        (workout) => ({
          ...workout,
          exercises: workout.exercises!.map((ex) => ({
            ...ex,
            sets: ex.sets!.map((set) => ({ ...set, type })),
          })),
        })
      );
      expect(detectStall(OHP, history)).toBeNull();
    }
  );
  it("changing preparation or drop sets cannot hide unchanged completed working sets", () => {
    const history = [10, 15, 20].map((weightKg) => ({
      exercises: [
        {
          exerciseName: OHP.name,
          plannedSetCount: 1,
          sets: [
            { type: "warmup", weightKg, reps: 12 },
            { type: "working", weightKg: 40, reps: 8 },
            { type: "dropset", weightKg, reps: 12 },
          ],
        },
      ],
    }));
    expect(detectStall(OHP, history)).toMatchObject({ weight: 40 });
  });
  it("a changed saved target is not three comparable attempts", () => {
    const history = [10, 9, 8].map((plannedReps) => ({
      exercises: [
        {
          exerciseName: OHP.name,
          plannedSetCount: 1,
          sets: [{ weightKg: 40, reps: 8, plannedReps, plannedWeightKg: 40 }],
        },
      ],
    }));
    expect(detectStall(OHP, history)).toBeNull();
  });
  it("does not merge a different exercise that happens to have the same name", () => {
    const history = sessions(OHP.name, [{ weightKg: 40, reps: 8 }]).map(
      (workout) => ({
        exercises: workout.exercises!.map((ex) => ({
          ...ex,
          exerciseId: "other-press",
        })),
      })
    );
    expect(detectStall(OHP, history)).toBeNull();
  });
});
