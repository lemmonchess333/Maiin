import { describe, it, expect } from "vitest";

import {
  backToBackPairs,
  capRepeatedLifts,
  expensiveExposures,
  lowCostAlternative,
  orderForAdjacency,
  surplusExposures,
  weekWrapsBackToBack,
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

describe("lowCostAlternative — a demoted slot keeps its CATEGORY", () => {
  it("offers a back-sparing hinge for an accessory, a compound for a main", () => {
    // Two different jobs. A demoted ACCESSORY should become the leg curl —
    // hamstring-primary, no spinal load at all. A demoted MAIN is still the
    // day's anchor, so it takes the hip thrust, which is a compound.
    expect(lowCostAlternative("hip_dominant", new Set())).toEqual({
      id: "seated-leg-curl",
      name: "Seated Leg Curl",
    });
    expect(lowCostAlternative("hip_dominant", new Set(), true)).toEqual({
      id: "hip-thrust",
      name: "Hip Thrust",
    });
  });

  it("skips anything already in the day rather than duplicating it", () => {
    expect(
      lowCostAlternative("hip_dominant", new Set(["seated-leg-curl"]))
    ).toEqual({ id: "hip-thrust", name: "Hip Thrust" });
    // A third back-sparing option (the bodyweight glute bridge) exists as of
    // 2026-07-28, added for equipment coverage — so two-in-the-day no longer
    // exhausts the list.
    expect(
      lowCostAlternative(
        "hip_dominant",
        new Set(["seated-leg-curl", "hip-thrust"])
      )
    ).toEqual({ id: "glute-bridge", name: "Glute Bridge" });
    expect(
      lowCostAlternative(
        "hip_dominant",
        new Set(["seated-leg-curl", "hip-thrust", "glute-bridge"])
      )
    ).toBeNull();
  });

  it("only answers for the patterns the cap actually governs", () => {
    // A cheap category never reaches this function, and must not get a
    // silent hinge substituted into it.
    expect(lowCostAlternative("horizontal_push", new Set())).toBeNull();
    expect(lowCostAlternative("arms_biceps", new Set())).toBeNull();
  });

  it("the replacements are not themselves counted as expensive", () => {
    // Otherwise the cap would fire again on its own output, forever.
    const swapped = day(
      { ...ex("hip_dominant"), exerciseId: "deadlift" } as ProgramExercise,
      {
        ...ex("hip_dominant", true),
        exerciseId: "seated-leg-curl",
      } as ProgramExercise
    );
    expect(expensiveExposures([swapped])).toHaveLength(1);
    expect(surplusExposures([swapped])).toHaveLength(0);
  });
});

describe("backToBackPairs — the week's SHAPE, not date-pinned lifts", () => {
  const sched = (days: number[]) =>
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day: d,
      type: days.includes(d) ? "lift" : "rest",
    }));

  it("a Mon/Wed/Fri lifter has no back-to-back sessions", () => {
    // The whole reason adjacency needs the schedule: for this user the rule
    // is a no-op, and nothing in workouts[] could have told us that.
    expect(backToBackPairs(sched([1, 3, 5]), 3)).toEqual([false, false]);
  });

  it("a Mon/Tue/Wed lifter is back-to-back throughout", () => {
    expect(backToBackPairs(sched([1, 2, 3]), 3)).toEqual([true, true]);
  });

  it("flags only the consecutive seams in a mixed week", () => {
    // Mon, Tue, Wed, Fri → seams 0-1 and 1-2 are adjacent, 2-3 is not.
    expect(backToBackPairs(sched([1, 2, 3, 5]), 4)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("counts 'both' days as lift days", () => {
    const mixed = [
      { day: 1, type: "lift" },
      { day: 2, type: "both" },
      { day: 4, type: "run" },
    ];
    expect(backToBackPairs(mixed, 2)).toEqual([true]);
  });

  it("assumes nothing when the schedule is unknown", () => {
    // Assuming back-to-back would apply a reorder to users it cannot help.
    expect(backToBackPairs(undefined, 3)).toEqual([false, false]);
    expect(backToBackPairs([], 3)).toEqual([false, false]);
  });

  it("is empty for a single session", () => {
    expect(backToBackPairs(sched([1]), 1)).toEqual([]);
  });

  it("detects the recurring Saturday-to-Sunday seam", () => {
    expect(weekWrapsBackToBack(sched([0, 3, 6]), 3)).toBe(true);
    expect(weekWrapsBackToBack(sched([1, 3, 5]), 3)).toBe(false);
  });
});

describe("orderForAdjacency", () => {
  const spread = [
    { day: 1, type: "lift" },
    { day: 3, type: "lift" },
    { day: 5, type: "lift" },
  ];
  const consecutive = [
    { day: 1, type: "lift" },
    { day: 2, type: "lift" },
    { day: 3, type: "lift" },
  ];
  // Two posterior-heavy days and one that isn't.
  const week = (): WorkoutDay[] => [
    day(ex("hip_dominant"), ex("horizontal_pull")),
    day(ex("hip_dominant"), ex("vertical_pull")),
    day(ex("horizontal_push"), ex("arms_triceps")),
  ];

  it("is a NO-OP for a spread-out week", () => {
    const w = week();
    expect(orderForAdjacency(w, spread)).toBe(w); // same reference
  });

  it("is a no-op when the schedule is unknown", () => {
    const w = week();
    expect(orderForAdjacency(w, undefined)).toBe(w);
  });

  it("separates the posterior-heavy days when the week IS consecutive", () => {
    const out = orderForAdjacency(week(), consecutive);
    const posterior = out.map((d) =>
      d.exercises.some((e) => e.movementCategory === "hip_dominant")
    );
    // the push day should sit between the two hinge days
    expect(posterior).toEqual([true, false, true]);
  });

  it("leaves a week alone when it cannot be improved", () => {
    const already = [
      day(ex("hip_dominant")),
      day(ex("horizontal_push")),
      day(ex("hip_dominant")),
    ];
    expect(orderForAdjacency(already, consecutive)).toBe(already);
  });

  it("does nothing with fewer than three sessions", () => {
    const two = [day(ex("hip_dominant")), day(ex("hip_dominant"))];
    expect(orderForAdjacency(two, consecutive)).toBe(two);
  });

  it("is deterministic", () => {
    const runs = Array.from({ length: 5 }, () =>
      orderForAdjacency(week(), consecutive).map((d) =>
        d.exercises.map((e) => e.movementCategory).join(",")
      )
    );
    runs.forEach((r) => expect(r).toEqual(runs[0]));
  });
});

describe("capRepeatedLifts — no lift more than twice a week", () => {
  const d = (...ids: string[]): WorkoutDay =>
    ({
      dayName: "D",
      dayType: "full_body",
      completed: false,
      skipped: false,
      exercises: ids.map((id) => ({
        name: id,
        exerciseId: id,
        movementCategory: "knee_dominant",
        isAccessory: false,
        sets: 3,
        reps: 8,
      })),
    }) as WorkoutDay;

  it("leaves a lift used twice alone — repetition IS the progression", () => {
    // Nippard N5: changing exercises week to week flattens the progression
    // curve. A cap of 1 would be actively harmful.
    const week = [d("squat"), d("squat"), d("leg-press")];
    expect(capRepeatedLifts(week)).toBe(week);
  });

  it("re-points the third exposure to another variation", () => {
    const out = capRepeatedLifts([d("squat"), d("squat"), d("squat")]);
    const ids = out.flatMap((x) => x.exercises.map((e) => e.exerciseId));
    expect(ids.filter((i) => i === "squat")).toHaveLength(2);
    expect(new Set(ids).size).toBe(2); // the third became something else
  });

  it("keeps the muscle frequency — only the variation changes", () => {
    const out = capRepeatedLifts([d("squat"), d("squat"), d("squat")]);
    out.forEach((day) =>
      day.exercises.forEach((e) =>
        expect(e.movementCategory).toBe("knee_dominant")
      )
    );
    expect(out.flatMap((x) => x.exercises)).toHaveLength(3);
  });

  it("keeps MAINS over accessories when choosing what to re-point", () => {
    const mk = (id: string, isAccessory: boolean): WorkoutDay =>
      ({
        dayName: "D",
        dayType: "full_body",
        completed: false,
        skipped: false,
        exercises: [
          {
            name: id,
            exerciseId: id,
            movementCategory: "knee_dominant",
            isAccessory,
            sets: 3,
            reps: 8,
          },
        ],
      }) as WorkoutDay;
    // accessory first, then two mains — the ACCESSORY should be the one moved
    const out = capRepeatedLifts([
      mk("squat", true),
      mk("squat", false),
      mk("squat", false),
    ]);
    expect(out[0].exercises[0].exerciseId).not.toBe("squat");
    expect(out[1].exercises[0].exerciseId).toBe("squat");
    expect(out[2].exercises[0].exerciseId).toBe("squat");
  });

  it("preserves sets, reps and accessory role on the re-pointed slot", () => {
    const out = capRepeatedLifts([d("squat"), d("squat"), d("squat")]);
    const moved = out[2].exercises[0];
    expect(moved.sets).toBe(3);
    expect(moved.reps).toBe(8);
    expect(moved.isAccessory).toBe(false);
  });

  it("never picks a replacement already present in that day", () => {
    // The cap's contract is the WEEKLY count; within-day uniqueness belongs to
    // dedupeDayExercises, which runs earlier in the pipeline. What the cap
    // must guarantee is that it does not make within-day duplication WORSE.
    const week = [
      d("squat", "leg-press", "front-squat"),
      d("squat"),
      d("squat"),
    ];
    const before = week[0].exercises.map((e) => e.exerciseId);
    const out = capRepeatedLifts(week);
    const after = out[0].exercises.map((e) => e.exerciseId);
    expect(new Set(after).size).toBe(new Set(before).size);
  });

  it("is deterministic", () => {
    const runs = Array.from({ length: 5 }, () =>
      capRepeatedLifts([d("squat"), d("squat"), d("squat")]).flatMap((x) =>
        x.exercises.map((e) => e.exerciseId)
      )
    );
    runs.forEach((r) => expect(r).toEqual(runs[0]));
  });
});
