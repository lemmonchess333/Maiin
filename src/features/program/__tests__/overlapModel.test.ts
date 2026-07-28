import { describe, it, expect } from "vitest";

import {
  expensiveExposures,
  leastTrainedCategory,
  surplusExposures,
  EXPENSIVE_PATTERNS,
  MAX_EXPENSIVE_SESSIONS_PER_WEEK,
} from "../overlapModel";
import type {
  MovementCategory,
  ProgramExercise,
  WorkoutDay,
} from "../programTypes";

/**
 * Backlog #10 (D1 + M6 + H6) — the overlap caps. Tropos's fractional volume
 * model was already an overlap model; it informed volume TOTALS but never
 * SCHEDULING, so nothing stopped the generator putting the same expensive
 * pattern in every session.
 */

const ex = (
  movementCategory: MovementCategory,
  isAccessory = false,
  sets = 3
): ProgramExercise =>
  ({
    name: movementCategory,
    exerciseId: `${movementCategory}-x`,
    movementCategory,
    isAccessory,
    sets,
    reps: 8,
  }) as ProgramExercise;

const day = (...exercises: ProgramExercise[]): WorkoutDay =>
  ({
    dayName: "D",
    dayType: "full_body",
    completed: false,
    skipped: false,
    exercises,
  }) as WorkoutDay;

describe("expensiveExposures", () => {
  it("finds every hinge slot with its position and role", () => {
    const week = [
      day(ex("horizontal_push"), ex("hip_dominant", true)),
      day(ex("hip_dominant")),
    ];
    expect(expensiveExposures(week)).toEqual([
      { dayIndex: 0, exIndex: 1, isAccessory: true },
      { dayIndex: 1, exIndex: 0, isAccessory: false },
    ]);
  });

  it("caps only the patterns every source flags — squats are not capped", () => {
    // 3x/week squatting in a 3-day full body is deliberate, advertised by
    // splitRationale, and backed by the frequency evidence the split rests
    // on. The heavy hinge is the one all four powerlifting sources single
    // out, and Meadows arrives there independently.
    expect(EXPENSIVE_PATTERNS.has("hip_dominant" as MovementCategory)).toBe(
      true
    );
    expect(EXPENSIVE_PATTERNS.has("knee_dominant" as MovementCategory)).toBe(
      false
    );
  });
});

describe("surplusExposures", () => {
  it("is empty when the week is already inside the caps", () => {
    expect(
      surplusExposures([day(ex("hip_dominant")), day(ex("horizontal_push"))])
    ).toEqual([]);
  });

  it("keeps one hinge per session — a deadlift AND an RDL is surplus", () => {
    const week = [
      day(ex("hip_dominant"), ex("knee_dominant"), ex("hip_dominant", true)),
    ];
    expect(surplusExposures(week)).toEqual([
      { dayIndex: 0, exIndex: 2, isAccessory: true },
    ]);
  });

  it("prefers the MAIN when a session has to give one up", () => {
    // The accessory goes, whichever order they appear in.
    const accFirst = [day(ex("hip_dominant", true), ex("hip_dominant"))];
    expect(surplusExposures(accFirst)).toEqual([
      { dayIndex: 0, exIndex: 0, isAccessory: true },
    ]);
  });

  it("caps weekly sessions, dropping accessory days before main days", () => {
    // The 3-day full-body shape: accessory hinge on day 0, mains on 1 and 2.
    const week = [
      day(ex("horizontal_push"), ex("hip_dominant", true)),
      day(ex("hip_dominant")),
      day(ex("hip_dominant")),
    ];
    expect(surplusExposures(week)).toEqual([
      { dayIndex: 0, exIndex: 1, isAccessory: true },
    ]);
  });

  it("drops the LATEST day when every hinge day is equal-priority", () => {
    const week = [
      day(ex("hip_dominant")),
      day(ex("hip_dominant")),
      day(ex("hip_dominant")),
    ];
    const surplus = surplusExposures(week);
    expect(surplus).toHaveLength(3 - MAX_EXPENSIVE_SESSIONS_PER_WEEK);
    expect(surplus[0].dayIndex).toBe(2);
  });

  it("is deterministic — the same week always yields the same surplus", () => {
    const build = () => [
      day(ex("hip_dominant", true), ex("hip_dominant")),
      day(ex("hip_dominant")),
      day(ex("hip_dominant")),
    ];
    const runs = Array.from({ length: 5 }, () => surplusExposures(build()));
    runs.forEach((r) => expect(r).toEqual(runs[0]));
  });
});

describe("leastTrainedCategory", () => {
  it("picks the category the week trains least", () => {
    // Everything else carries volume; triceps is the unique minimum at 0.
    const week = [
      day(
        ex("horizontal_push", false, 10),
        ex("knee_dominant", false, 10),
        ex("vertical_push", false, 4),
        ex("horizontal_pull", false, 4),
        ex("arms_biceps", false, 4),
        ex("core", false, 4)
      ),
    ];
    expect(leastTrainedCategory(week, new Set())).toBe("arms_triceps");
  });

  it("breaks ties on a fixed order so regenerates can't churn", () => {
    // Shoulders and Triceps are both untrained here; the answer must be
    // stable, not incidental. Whatever it is, it must not vary run to run.
    const week = [day(ex("horizontal_push", false, 10))];
    const picks = Array.from({ length: 5 }, () =>
      leastTrainedCategory(week, new Set())
    );
    picks.forEach((p) => expect(p).toBe(picks[0]));
  });

  it("never suggests a category already in that day", () => {
    const week = [day(ex("horizontal_push"))];
    const excluded = new Set<MovementCategory>([
      "arms_triceps",
      "arms_biceps",
      "core",
      "vertical_push",
      "horizontal_pull",
    ]);
    const pick = leastTrainedCategory(week, excluded);
    expect(pick).not.toBeNull();
    expect(excluded.has(pick!)).toBe(false);
  });

  it("never swaps one expensive pattern for another", () => {
    const week = [day(ex("horizontal_push"))];
    // Everything cheap is excluded — it must return null rather than
    // reaching for a hinge.
    const excluded = new Set<MovementCategory>([
      "horizontal_push",
      "vertical_push",
      "horizontal_pull",
      "vertical_pull",
      "knee_dominant",
      "arms_biceps",
      "arms_triceps",
      "core",
    ]);
    expect(leastTrainedCategory(week, excluded)).toBeNull();
  });
});
