/**
 * The race's final weeks for the lifting (Lift4 (10)): the last two weeks
 * before the race are lighter whatever the taper's length, race week is one
 * short session with nothing heavy for the legs, and the week after is
 * light. Together they replace the calendar lighter week, and its count
 * starts again after them. They are for everyone with a race plan, and win
 * over every other lightening (the precedence table in the lifting
 * handoff).
 */
import { describe, it, expect } from "vitest";
import { advanceWeek, easeBackIn } from "../programEngine";
import { applySessionProgression } from "../sessionCompletion";
import {
  raceBlockWeek,
  raceLiftWeek,
  type RaceBlockWeek,
} from "../weekPrescription";
import type {
  ProgramExercise,
  ProgramState,
  WorkoutDay,
} from "../programTypes";
import { liftWeekLabel } from "@/lib/liftWeekLabel";
import {
  RACE_AFTER,
  RACE_TAPER,
  RACE_WEEK,
  liftSessionPurpose,
} from "@/lib/liftSessionPurpose";

/** A 16-week half marathon: the race in week 15, the last two before it
 *  13 and 14, a two-week taper. */
const half = (weekIndex: number): RaceBlockWeek => ({
  weekIndex,
  totalWeeks: 16,
  distance: "half",
});

function lift(over: Partial<ProgramExercise>): ProgramExercise {
  return {
    name: "Squat",
    exerciseId: "squat",
    instanceId: "squat",
    movementCategory: "knee_dominant",
    sets: 4,
    reps: 5,
    weight: 100,
    progressionType: "linear",
    lastSuccessfulWeight: 100,
    lastAttemptedWeight: 100,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...over,
  };
}

const day = (dayName: string, completed = true): WorkoutDay => ({
  dayName,
  dayType: "full_body",
  completed,
  exercises: [
    lift({ instanceId: `${dayName}-squat` }),
    lift({
      name: "Bench Press",
      exerciseId: "bench-press",
      instanceId: `${dayName}-bench`,
      movementCategory: "horizontal_push",
      weight: 80,
    }),
  ],
});

/** A beginner's two-day week: no calendar lighter weeks of its own. */
function week(over: Partial<ProgramState> = {}): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "progression",
    weekNumber: 6,
    splitType: "full_body",
    workouts: [day("A"), day("B")],
    fatigueScore: 0,
    updatedAt: 0,
    ...over,
  } as ProgramState;
}

const trained = (s: ProgramState): ProgramState => ({
  ...s,
  workouts: s.workouts.map((d) => ({ ...d, completed: true })),
});
const sets = (s: ProgramState) =>
  s.workouts.flatMap((d) => d.exercises.map((e) => e.sets));

describe("raceLiftWeek", () => {
  it("names the last two weeks before the race, race week and the week after", () => {
    expect(raceLiftWeek(half(12), undefined)).toBeNull();
    expect(raceLiftWeek(half(13), undefined)).toBe("taper");
    expect(raceLiftWeek(half(14), "taper")).toBe("taper");
    expect(raceLiftWeek(half(15), "taper")).toBe("race");
    // The week after follows race week, wherever the run plan has gone.
    expect(raceLiftWeek(null, "race")).toBe("after");
    expect(raceLiftWeek(null, "taper")).toBeNull();
    expect(raceLiftWeek(null, "after")).toBeNull();
    expect(raceLiftWeek(undefined, undefined)).toBeNull();
  });
});

describe("the race's final weeks", () => {
  it("lightens the last two weeks for anyone, two in a row", () => {
    const first = advanceWeek(week(), "beginner", undefined, half(13));
    expect(first.currentPhase).toBe("deload");
    expect(first.raceWeek).toBe("taper");
    expect(sets(first)).toEqual([2, 2, 2, 2]);
    const second = advanceWeek(trained(first), "beginner", undefined, half(14));
    expect(second.currentPhase).toBe("deload");
    expect(sets(second)).toEqual([2, 2, 2, 2]);
  });

  it("comes whether or not the week before was trained", () => {
    const idle = week({
      workouts: [day("A", false), day("B", false)],
    });
    const out = advanceWeek(idle, "intermediate", undefined, half(13));
    expect(out.raceWeek).toBe("taper");
    expect(out.currentPhase).toBe("deload");
  });

  it("makes race week one short session with light legs", () => {
    const race = advanceWeek(trained(week()), "beginner", undefined, half(15));
    expect(race.raceWeek).toBe("race");
    expect(race.workouts.map((d) => d.skipped)).toEqual([false, true]);
    const [squat, bench] = race.workouts[0].exercises;
    expect(squat.sets).toBe(2);
    expect(squat.weight).toBe(50);
    expect(squat.preDeloadWeight).toBe(100);
    // Nothing else comes down in weight.
    expect(bench.weight).toBe(80);
  });

  it("makes the week after light, gives the legs back, and starts the count again", () => {
    const race = advanceWeek(
      trained(week({ weekNumber: 4 })),
      "beginner",
      undefined,
      half(15)
    );
    expect(race.weekNumber).toBe(5);
    const after = advanceWeek(trained(race), "intermediate", undefined, null);
    expect(after.raceWeek).toBe("after");
    expect(after.currentPhase).toBe("deload");
    expect(after.workouts.every((d) => !d.skipped)).toBe(true);
    expect(after.workouts[0].exercises[0].weight).toBe(100);
    expect(after.workouts[0].exercises[0].preDeloadWeight).toBeUndefined();
    // The week after ends a cycle (week 6 would have been next), so the
    // next lighter week is four on.
    expect(after.weekNumber).toBe(8);
    let s = after;
    for (let i = 0; i < 3; i++) {
      s = advanceWeek(
        trained({ ...s, workouts: [...s.workouts, day("C")].slice(0, 3) }),
        "intermediate"
      );
      expect(s.currentPhase, `week ${s.weekNumber}`).toBe("progression");
      expect(s.raceWeek).toBeUndefined();
    }
    s = advanceWeek(trained(s), "intermediate");
    expect(s.weekNumber).toBe(after.weekNumber + 4);
    expect(s.currentPhase).toBe("deload");
  });

  it("comes once the race is logged and the run plan is in its recovery", () => {
    // Race week with no session done, as many will be.
    const race = advanceWeek(trained(week()), "beginner", undefined, half(15));
    // Logging the race puts the run plan into its recovery straight away,
    // and the recovery has no block week to read.
    const recovering = raceBlockWeek({
      mode: "race_prep",
      raceGoal: { distance: "half", targetDate: "2026-12-20" },
      currentWeek: 15,
      totalWeeks: 16,
      phase: "recovery",
      recoveryEndDate: "2027-01-03",
    });
    expect(recovering).toBeNull();
    const after = advanceWeek(race, "intermediate", undefined, recovering);
    expect(after.raceWeek).toBe("after");
    expect(after.currentPhase).toBe("deload");
    expect(after.weekNumber).toBe(8);
    // Once, not every week the recovery lasts.
    const later = advanceWeek(
      trained(after),
      "intermediate",
      undefined,
      recovering
    );
    expect(later.raceWeek).toBeUndefined();
    expect(later.currentPhase).toBe("progression");
  });

  it("gives the legs their weight back after a race week session at the light weight", () => {
    const race = advanceWeek(trained(week()), "beginner", undefined, half(15));
    const lifts = race.workouts[0].exercises;
    const done = applySessionProgression(race, 0, {
      completionId: "race-week",
      date: "2026-12-15",
      prescription: { exercises: lifts, progressionBaseline: lifts },
      setLogs: lifts.map((lift) =>
        Array.from({ length: lift.sets }, () => ({
          weight: lift.weight,
          reps: lift.reps,
          completed: true,
        }))
      ),
    });
    expect(done.workouts[0].exercises[0].weight).toBe(50);
    const after = advanceWeek(done, "intermediate", undefined, null);
    expect(after.workouts.map((d) => d.exercises[0].weight)).toEqual([
      100, 100,
    ]);
  });

  it("wins over easing back after a break, without stacking", () => {
    const eased = easeBackIn(week({ weekNumber: 6 }), 0.1);
    const idle = {
      ...eased,
      workouts: eased.workouts.map((d) => ({ ...d, completed: false })),
    };
    const out = advanceWeek(idle, "beginner", undefined, half(13));
    // Half the plan's sets, not half of one set fewer.
    expect(sets(out)).toEqual([2, 2, 2, 2]);
  });
});

describe("easing back after a break inside the race's final weeks", () => {
  it("keeps the taper's sets", () => {
    const taper = advanceWeek(week(), "beginner", undefined, half(13));
    expect(sets(easeBackIn(taper, 0.1))).toEqual([2, 2, 2, 2]);
  });

  it("brings race week's legs back to the eased weight, not the old one", () => {
    const race = advanceWeek(trained(week()), "beginner", undefined, half(15));
    const eased = easeBackIn(race, 0.1);
    const squat = eased.workouts[0].exercises[0];
    // Already half its weight this week; the weight it goes back to comes
    // down instead.
    expect(squat.weight).toBe(50);
    expect(squat.preDeloadWeight).toBe(90);
    const after = advanceWeek(eased, "intermediate", undefined, null);
    const back = after.workouts[0].exercises[0];
    expect(back.weight).toBe(90);
    // And it climbs back to where it was, as any eased lift does.
    expect(back.lowered).toMatchObject({ from: 100, unit: "kg" });
  });
});

describe("what the race's final weeks say", () => {
  const racing = (weekIndex: number, raceWeek?: ProgramState["raceWeek"]) => ({
    weekNumber: 6,
    currentPhase: "deload" as const,
    primaryGoal: "running" as const,
    workouts: [day("A"), day("B"), day("C")],
    raceWeek,
    runPlan: {
      mode: "race_prep" as const,
      raceGoal: { distance: "half", targetDate: "2026-12-20" },
      currentWeek: weekIndex,
      totalWeeks: 16,
    },
  });

  it("names them in the run plan's words", () => {
    expect(liftWeekLabel(racing(14, "taper"), "2026-12-10")).toBe(
      "Week 15 of 16 · Taper"
    );
    expect(liftWeekLabel(racing(15, "race"), "2026-12-15")).toBe(
      "Week 16 of 16 · Race"
    );
    expect(
      liftWeekLabel(
        { ...racing(15, "after"), runPlan: undefined },
        "2026-12-22",
        "intermediate"
      )
    ).toBe("Week 2 of 4 · Recovery");
  });

  it("calls a 10K's lighter last build week a lighter week", () => {
    // A 10K tapers one week, so the first of the last two is still Build.
    const tenK = {
      ...racing(13, "taper"),
      runPlan: {
        mode: "race_prep" as const,
        raceGoal: { distance: "10k", targetDate: "2026-12-20" },
        currentWeek: 13,
        totalWeeks: 16,
      },
    };
    expect(liftWeekLabel(tenK, "2026-12-01")).toBe(
      "Week 14 of 16 · Lighter week"
    );
  });

  it("says why in each, and when to lift in race week", () => {
    const why = (p: ReturnType<typeof racing>) =>
      liftSessionPurpose(p, { isCustom: false }, "2026-12-15", "intermediate");
    expect(why(racing(14, "taper"))).toBe(RACE_TAPER);
    expect(why(racing(15, "race"))).toBe(
      `${RACE_WEEK} Lift by Thursday 17 December, three days before the race.`
    );
    expect(why(racing(15, "after"))).toBe(RACE_AFTER);
  });
});
