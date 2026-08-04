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

  it("fires once a load exists even if some sets are 0", () => {
    // A partially-logged session still has a real working weight — the
    // uncalibrated guard is "no load anywhere", not "any zero present".
    const history = sessions("Overhead Press", [
      { weightKg: 40, reps: 8 },
      { weightKg: 0, reps: 0 },
    ]);
    expect(detectStall(OHP, history)).not.toBeNull();
  });
});

describe("detectStall — bodyweight lifts judge on reps, not load", () => {
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
          { exerciseName: "Overhead Press", sets: [{ weightKg: 42.5 }] },
        ],
      },
      {
        exercises: [
          { exerciseName: "Overhead Press", sets: [{ weightKg: 40 }] },
        ],
      },
      {
        exercises: [
          { exerciseName: "Overhead Press", sets: [{ weightKg: 40 }] },
        ],
      },
    ];
    expect(detectStall(OHP, history)).toBeNull();
  });
});
